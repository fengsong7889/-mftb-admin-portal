package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmIdempotentLog;
import com.mftb.admin.mapper.RdmIdempotentLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.function.Supplier;

/**
 * RDM 幂等服务。
 *
 * <p>提供两套并存的幂等能力：
 * <ol>
 *   <li><b>旧路径（V1/V2，向后兼容，勿删）</b>：{@link #checkIdempotent} + {@link #recordResult}，
 *       只认 {@code request_id} 唯一键、业务后插入、吞异常。仅供尚未迁移的旧调用方使用，
 *       <b>无法阻止并发双副作用</b>，新写操作一律不得再用。</li>
 *   <li><b>原子路径（Batch 3 / rdm:schema:v3.2，任务 19-22 消费）</b>：{@link #executeOnce}，
 *       以「业务执行前占位 + 业务与结果同事务写入 + 唯一约束兜底并发」实现真正的原子幂等。</li>
 * </ol>
 *
 * <h2>executeOnce 原子性契约</h2>
 * <ul>
 *   <li>占位唯一键：写入 {@code rdm_idempotent_log.request_id} = {@code SHA-256(userId|bizType|resourceKey|clientRequestId)}，
 *       <b>复用既有唯一索引 {@code uk_request_id}</b>（不新增索引、不改 Martin 的 SQL）。
 *       绑定列 user_id/resource_key/client_request_id/request_hash/status 受 CHECK 约束
 *       {@code ck_rdm_idempotent_binding} 保护，processing/completed 时必须全部非空。</li>
 *   <li>同一事务：占位(status=processing) → 业务执行 → 结果写回(status=completed, result_json) 三步在一个事务内。</li>
 *   <li>并发只一个成功：第二个事务的占位 INSERT 会在唯一索引上阻塞，待第一个提交后收到
 *       {@link DuplicateKeyException}；此时在<b>新的只读事务</b>里重查并回放/判定，绝不双执行。</li>
 *   <li>回放规则：同键同 requestHash 且已 completed → 回放首次结果；同键不同 requestHash → 抛冲突异常；
 *       user_id 与当前认证用户不同 → 拒绝跨用户回放，抛权限异常。</li>
 *   <li>不吞异常：业务异常让整个事务回滚（占位行一并回滚，不留 processing 僵尸行）并向上传播；
 *       只有「占位唯一键冲突=并发重复」这一类可安全转回放/冲突。</li>
 * </ul>
 *
 * <p><b>调用约束</b>：{@link #executeOnce} 自身即事务边界，调用方<b>不得</b>把它包在自己的活动事务里，
 * 否则占位冲突会把外层事务标记为 rollback-only。业务动作（{@code businessAction}）内部的
 * {@code @Transactional} 方法会以 PROPAGATION_REQUIRED 加入本事务，符合预期。
 *
 * <p>userId 已参与占位键派生，结构上隔离不同用户；{@link #executeOnce} 仍显式校验 user_id 作为纵深防御。
 */
@Slf4j
@Service
public class RdmIdempotentService {

    /**
     * {@code rdm_idempotent_log.client_request_id} 列宽：{@code VARCHAR(64) CHARACTER SET ascii}（见 237）。
     * <p>任何落库到该列的值都绝不可超宽或含非 ASCII，否则 MySQL 严格模式下占位 INSERT 直接失败，
     * 进而令 {@link #executeOnce} 抛错、整个业务写操作运行期报错。
     */
    private static final int CLIENT_REQUEST_ID_MAX = 64;

    private final RdmIdempotentLogMapper idempotentLogMapper;
    private final ObjectMapper objectMapper;
    /** 稳定序列化专用 mapper：字段按字母序、Map 按 key 排序，保证同内容请求体得到同一 requestHash。 */
    private final ObjectMapper stableMapper;
    /** 写事务模板：占位 + 业务 + 结果写回同一事务（PROPAGATION_REQUIRED）。 */
    private final TransactionTemplate writeTxTemplate;
    /** 只读事务模板：回放重查用（PROPAGATION_REQUIRES_NEW + readOnly），确保读到已提交的胜者行。 */
    private final TransactionTemplate readTxTemplate;

    public RdmIdempotentService(RdmIdempotentLogMapper idempotentLogMapper,
                                ObjectMapper objectMapper,
                                PlatformTransactionManager transactionManager) {
        this.idempotentLogMapper = idempotentLogMapper;
        this.objectMapper = objectMapper;
        this.stableMapper = objectMapper.copy()
                .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true)
                .configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);
        this.writeTxTemplate = new TransactionTemplate(transactionManager);
        this.writeTxTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        this.readTxTemplate = new TransactionTemplate(transactionManager);
        this.readTxTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.readTxTemplate.setReadOnly(true);
    }

    /* ==================== 原子幂等（Batch 3，任务 19-22 消费） ==================== */

    /**
     * 原子幂等执行入口。
     *
     * <p>准确签名（供任务 19-22 直接消费）：
     * <pre>{@code public <T> T executeOnce(IdempotentKey key, Supplier<T> businessAction, Class<T> resultType)}</pre>
     *
     * @param key            幂等绑定键（userId + bizType + resourceKey + clientRequestId + requestHash），不可为空
     * @param businessAction 业务动作；其返回值将被序列化缓存，供相同请求回放。业务异常会触发整体回滚并向上传播
     * @param resultType     业务结果类型，用于回放时反序列化 {@code result_json}；无返回值传 {@code Void.class}
     * @param <T>            业务结果类型
     * @return 首次执行返回业务结果；重复请求返回首次缓存的结果（回放）
     * @throws BusinessException 同键不同内容（CONFLICT）、跨用户回放（FORBIDDEN）、并发处理中（CONFLICT）
     */
    public <T> T executeOnce(IdempotentKey key, Supplier<T> businessAction, Class<T> resultType) {
        Objects.requireNonNull(key, "IdempotentKey 不可為空");
        Objects.requireNonNull(businessAction, "businessAction 不可為空");
        Objects.requireNonNull(resultType, "resultType 不可為空");

        final String requestId = bindingRequestId(key);

        // 1) 预检：已有已提交的占位/完成行时，直接在只读事务里回放或判定冲突，不开写事务、不重复执行业务。
        RdmIdempotentLog existing = selectByRequestId(requestId);
        if (existing != null) {
            return resolveExisting(existing, key, resultType);
        }

        // 2) 首次执行：占位(processing) + 业务 + 结果写回(completed) 同一事务。
        try {
            return writeTxTemplate.execute(status -> {
                RdmIdempotentLog placeholder = new RdmIdempotentLog();
                placeholder.setRequestId(requestId);
                placeholder.setBizType(key.getBizType());
                placeholder.setUserId(key.getUserId());
                placeholder.setResourceKey(key.getResourceKey());
                // 中心 choke point：单独存储的 client_request_id 列值必须归一化到 ≤64 纯 ASCII。
                // 注意 bindingRequestId(request_id 占位键) 仍基于「逻辑」clientRequestId 派生（见下），
                // 绑定语义不受影响；此处只规范化写入 client_request_id 列的副本。
                placeholder.setClientRequestId(normalizeClientRequestId(key.getClientRequestId()));
                placeholder.setRequestHash(key.getRequestHash());
                placeholder.setStatus(RdmConstants.IDEMPOTENT_STATUS_PROCESSING);
                try {
                    idempotentLogMapper.insert(placeholder);
                } catch (DuplicateKeyException dup) {
                    // 占位唯一键冲突 = 并发重复请求，另一事务已抢先占位。
                    // 本事务此刻尚无任何业务副作用，抛出信号让其整体回滚，转由只读事务回放/判定。
                    throw new ConcurrentDuplicateSignal(dup);
                }

                // 业务执行：任何异常（含业务自身抛出的 DuplicateKeyException）都向上传播 → 事务回滚 → 占位行消失。
                T result = businessAction.get();

                RdmIdempotentLog done = new RdmIdempotentLog();
                done.setId(placeholder.getId());
                done.setStatus(RdmConstants.IDEMPOTENT_STATUS_COMPLETED);
                done.setResultJson(serialize(result));
                done.setCompletedAt(LocalDateTime.now());
                idempotentLogMapper.updateById(done);
                return result;
            });
        } catch (ConcurrentDuplicateSignal signal) {
            // 3) 并发重复：胜者事务已提交，在新的只读事务里重查并回放/判定，绝不双执行。
            RdmIdempotentLog winner = selectByRequestId(requestId);
            if (winner == null) {
                // 理论上不应发生（唯一冲突却查不到已提交行，例如胜者也回滚了）；保守拒绝，让客户端重试。
                log.warn("並發幂等衝突但無已提交勝者行: {}", key);
                throw new BusinessException(ResultCode.CONFLICT.getCode(), "並發請求衝突，請稍後重試");
            }
            return resolveExisting(winner, key, resultType);
        }
    }

    /**
     * 依据已存在的幂等行决定回放 / 冲突 / 拒绝跨用户。
     * <p>校验顺序：先用户（安全，纵深防御）→ 再内容哈希（一致性）→ 最后状态。
     */
    private <T> T resolveExisting(RdmIdempotentLog row, IdempotentKey key, Class<T> resultType) {
        if (row.getUserId() != null && !Objects.equals(row.getUserId(), key.getUserId())) {
            // userId 已参与占位键派生，正常不会命中；命中说明数据异常或跨用户重放，一律拒绝。
            log.warn("拒絕跨用戶幂等回放: key={}, rowUserId={}", key, row.getUserId());
            throw new BusinessException(ResultCode.FORBIDDEN.getCode(), "幂等請求綁定用戶不一致，拒絕回放");
        }
        if (row.getRequestHash() != null && !Objects.equals(row.getRequestHash(), key.getRequestHash())) {
            throw new BusinessException(ResultCode.CONFLICT.getCode(), "相同幂等鍵但請求內容不一致，拒絕執行");
        }
        String status = row.getStatus();
        if (RdmConstants.IDEMPOTENT_STATUS_COMPLETED.equals(status)) {
            log.info("幂等命中，回放首次結果: {}", key);
            return deserialize(row.getResultJson(), resultType);
        }
        if (RdmConstants.IDEMPOTENT_STATUS_PROCESSING.equals(status)) {
            // 已提交的 processing 行意味着前一次尝试异常中断（正常路径业务异常会回滚占位）。
            // 保守拒绝，避免在状态不明时二次执行产生双副作用。
            throw new BusinessException(ResultCode.CONFLICT.getCode(), "相同幂等請求正在處理中，請勿重複提交");
        }
        throw new BusinessException(ResultCode.CONFLICT.getCode(), "幂等記錄狀態異常: " + status);
    }

    /** 在只读事务里按占位唯一键（request_id）重查幂等行。 */
    private RdmIdempotentLog selectByRequestId(String requestId) {
        return readTxTemplate.execute(s -> idempotentLogMapper.selectOne(
                new LambdaQueryWrapper<RdmIdempotentLog>()
                        .eq(RdmIdempotentLog::getRequestId, requestId)
                        .last("LIMIT 1")));
    }

    /* ==================== 哈希与序列化工具 ==================== */

    /**
     * 派生占位唯一键：{@code SHA-256(userId|bizType|resourceKey|clientRequestId)} 的 64 位小写 hex，
     * 写入 {@code rdm_idempotent_log.request_id}，复用既有唯一索引 {@code uk_request_id}。
     * <p>与内容哈希 {@code requestHash} 分开：前者是「谁对哪个资源的哪个请求」的身份，后者是「请求内容」的指纹。
     */
    public static String bindingRequestId(IdempotentKey key) {
        String raw = key.getUserId() + "|" + key.getBizType() + "|" + key.getResourceKey() + "|" + key.getClientRequestId();
        return sha256Hex(raw);
    }

    /**
     * 对请求体做稳定序列化（字段字母序、Map key 排序）后取 SHA-256，供 {@link IdempotentKey#getRequestHash()} 使用。
     * <p>相同业务内容无论字段书写顺序如何都得到同一哈希；不同内容必然不同哈希，用于冲突判定。
     */
    public String stableRequestHash(Object payload) {
        try {
            return sha256Hex(stableMapper.writeValueAsString(payload));
        } catch (JsonProcessingException e) {
            throw new BusinessException(ResultCode.PARAM_ERROR.getCode(), "請求體無法穩定序列化，無法生成幂等哈希");
        }
    }

    /**
     * 归一化写入 {@code rdm_idempotent_log.client_request_id}（{@code VARCHAR(64) ascii}）的值。
     *
     * <p>规则：若入参 {@code length>64} 或含非可打印 ASCII 字符（超出 {@code 0x20..0x7E}），
     * 则替换为 {@link #sha256Hex(String)}（定长 64 位小写 hex，天然 ASCII 且恰好 ≤64）；否则原样返回。
     *
     * <p><b>确定性 + 幂等</b>：对已 ≤64 的纯 ASCII 值不变；对归一化产出的 64 位 hex 再次归一化仍不变
     * （hex 全落在 {@code 0x30..0x66} 且长度恰为 64）。{@code null} 原样返回（旧 V1/V2 路径不回填该列）。
     *
     * <p>此方法是全系统写入该列的唯一中心兜底点：即便个别调用方（如任务21 拼 {@code op+":"+64hex}）
     * 产出超宽值，也能在此收敛，避免幂等占位 INSERT 因列宽溢出而失败。
     */
    public static String normalizeClientRequestId(String clientRequestId) {
        if (clientRequestId == null) {
            return null;
        }
        return fitsClientRequestIdColumn(clientRequestId) ? clientRequestId : sha256Hex(clientRequestId);
    }

    /** 是否可直接写入 {@code client_request_id VARCHAR(64) ascii}：长度 ≤64 且全为可打印 ASCII。 */
    private static boolean fitsClientRequestIdColumn(String raw) {
        if (raw.length() > CLIENT_REQUEST_ID_MAX) {
            return false;
        }
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c < 0x20 || c > 0x7E) {
                return false;
            }
        }
        return true;
    }

    /** SHA-256 十六进制小写摘要（固定 64 字符）。 */
    public static String sha256Hex(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 算法不可用", e);
        }
    }

    private String serialize(Object result) {
        try {
            return objectMapper.writeValueAsString(result);
        } catch (JsonProcessingException e) {
            // 序列化失败发生在业务之后、写回之前：抛出让整个事务回滚（fail-closed），不留半状态。
            throw new BusinessException(ResultCode.ERROR.getCode(), "幂等結果序列化失敗");
        }
    }

    private <T> T deserialize(String json, Class<T> resultType) {
        if (Void.class.equals(resultType)) {
            return null;
        }
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, resultType);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ResultCode.ERROR.getCode(), "幂等結果反序列化失敗");
        }
    }

    /** 内部信号：占位唯一键冲突（并发重复），用于把「占位冲突」与「业务自身异常」区分开。 */
    private static final class ConcurrentDuplicateSignal extends RuntimeException {
        ConcurrentDuplicateSignal(Throwable cause) {
            super(cause);
        }
    }

    /* ==================== 旧路径（V1/V2 向后兼容，勿删；新写操作禁用） ==================== */

    /**
     * 检查请求是否已处理（旧路径）。
     *
     * @param requestId 客户端携带的幂等请求ID（空则不启用幂等）
     * @param bizType   业务类型（仅用于日志区分，命中判定只认 requestId 唯一键）
     * @return 已处理则返回缓存的结果 JSON 文本；首次请求或空 requestId 返回 {@code null}
     * @deprecated 无法阻止并发双副作用，新写操作请改用 {@link #executeOnce}。
     */
    @Deprecated
    public String checkIdempotent(String requestId, String bizType) {
        if (requestId == null || requestId.isBlank()) {
            return null;
        }
        RdmIdempotentLog existing = idempotentLogMapper.selectOne(new LambdaQueryWrapper<RdmIdempotentLog>()
                .eq(RdmIdempotentLog::getRequestId, requestId)
                .last("LIMIT 1"));
        if (existing != null) {
            log.info("幂等命中，回放首次結果: requestId={}, bizType={}", requestId, bizType);
            return existing.getResultJson();
        }
        return null;
    }

    /**
     * 记录请求处理结果，供后续同 requestId 请求回放（旧路径）。
     *
     * @param requestId 客户端携带的幂等请求ID（空则不记录）
     * @param bizType   业务类型
     * @param result    业务返回对象（序列化为 JSON 存储）
     * @deprecated 业务后插入且吞全部异常，无法阻止并发双副作用，新写操作请改用 {@link #executeOnce}。
     */
    @Deprecated
    public void recordResult(String requestId, String bizType, Object result) {
        if (requestId == null || requestId.isBlank()) {
            return;
        }
        try {
            RdmIdempotentLog entry = new RdmIdempotentLog();
            entry.setRequestId(requestId);
            entry.setBizType(bizType);
            entry.setResultJson(result == null ? null : objectMapper.writeValueAsString(result));
            idempotentLogMapper.insert(entry);
        } catch (Exception e) {
            // 唯一键冲突 = 并发下的同一请求已有人写入结果，安全忽略；序列化失败也不应阻断主业务
            log.warn("幂等日誌寫入失敗（可能並發重複或序列化異常）: requestId={}, bizType={}, err={}",
                    requestId, bizType, e.getMessage());
        }
    }
}
