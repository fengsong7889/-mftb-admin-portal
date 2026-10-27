package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmTestBatchDTO;
import com.mftb.admin.dto.RdmTestBatchVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmIssue;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmTestExecution;
import com.mftb.admin.entity.RdmTestRound;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmTestRoundMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * RDM 提测批次服务（流程版本 3 · 项目交付与质量管理链路）。
 *
 * <p>三条不可让的口径：
 * <ol>
 *   <li><b>范围冻结</b>：提测即冻结交付项范围快照，后续需求变更不影响本批次结论，
 *       避免「测的时候是 A、放行时按 B 算」；快照一律由服务端按交付项重算，前端传值不认；</li>
 *   <li><b>轮次只增不改</b>：复测走 round_no+1，旧轮次执行记录只读保留，
 *       否则返工会抹掉历史证据、一次通过率失真；</li>
 *   <li><b>放行闸门只认服务端事实</b>：{@link #isTestPassed} 由执行记录与未闭环缺陷算出。</li>
 * </ol>
 *
 * <p>本服务只作用于 flow_version=3 的新链路；旧流程需求的上线仍走 {@link RdmReleaseService}。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmTestBatchService {

    /** 提测批次号规则 key（对应 sys_biz_seq_rule，前缀 TC + YYYYMMDD + 4 位） */
    private static final String SEQ_TEST_BATCH = "rdm_test_batch";

    /** 执行结果 */
    private static final String RESULT_PASS = "pass";
    private static final String RESULT_FAIL = "fail";
    private static final String RESULT_BLOCKED = "blocked";
    private static final String RESULT_SKIP = "skip";
    private static final List<String> RESULTS = List.of(RESULT_PASS, RESULT_FAIL, RESULT_BLOCKED, RESULT_SKIP);

    /** executeOnce 业务类型：受理冻结轮次 / 录入执行 / 发起复测（Batch 3 原子幂等） */
    private static final String BIZ_TEST_ACCEPT = "rdm_test_accept";
    private static final String BIZ_TEST_EXEC = "rdm_test_exec";
    private static final String BIZ_TEST_RETEST = "rdm_test_retest";

    private final RdmTestBatchMapper batchMapper;
    private final RdmTestExecutionMapper executionMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmRequirementMapper requirementMapper;
    private final RdmIssueMapper issueMapper;
    private final RdmAccessGuard accessGuard;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;
    /** Batch 3：不可变测试轮次事实（受理即冻结用例集/范围/构建） */
    private final RdmTestRoundMapper testRoundMapper;
    /**
     * 任务33：范围变更「证据失效过滤」统一委派共享解析器。
     * <p>历史上此处注入 {@code RdmEvidenceInvalidationMapper} 复刻了 {@link RdmDeliveryItemService} 的失效过滤语义（三处重复、有漂移风险），
     * 现统一抽取为 {@link EvidenceValidityResolver}；该解析器只依赖 Mapper，不反向依赖本服务，无循环依赖。
     */
    private final EvidenceValidityResolver evidenceValidityResolver;
    /** Batch 3：受理/执行/复测接入原子幂等 executeOnce */
    private final RdmIdempotentService idempotentService;
    /** 按任务解析提测范围：交付项归属/默认交付项复用交付项服务，不在测试层重建一套 */
    private final RdmDeliveryItemService deliveryItemService;

    /* ==================== 提测批次流转 ==================== */

    /**
     * 按任务解析提测范围：研发在提测页勾任务，服务端映射成交付项。
     * <p>已挂交付项的任务直接复用；未挂的归入需求默认交付项并回填 task.delivery_item_id。
     * 返回的是交付项列表（提测提交仍传 deliveryItemIds），测试/验收事实层不变。
     */
    public List<RdmTestBatchVO.TaskScopeItem> resolveTaskScope(RdmTestBatchDTO.TaskScopeResolve dto,
                                                              Long currentUserId) {
        if (dto == null) {
            throw new BusinessException("提測參數不能為空");
        }
        List<RdmDeliveryItem> items = deliveryItemService.resolveTaskScope(
                dto.getReqId(), dto.getTaskIds(), currentUserId);
        List<RdmTestBatchVO.TaskScopeItem> result = new ArrayList<>();
        for (RdmDeliveryItem item : items) {
            RdmTestBatchVO.TaskScopeItem vo = new RdmTestBatchVO.TaskScopeItem();
            vo.setId(item.getId());
            vo.setItemNo(item.getItemNo());
            vo.setTitle(item.getTitle());
            vo.setStatus(item.getStatus());
            result.add(vo);
        }
        return result;
    }

    /**
     * 提交提测批次。
     * <p>交付项须处于 developing（研发完成待测）才允许提测；提测即由服务端冻结范围快照，状态置 pending。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmTestBatch submitBatch(RdmTestBatchDTO.Submit dto, Long currentUserId, String currentUserName) {
        if (dto == null) {
            throw new BusinessException("提測參數不能為空");
        }
        List<Long> itemIds = dto.getDeliveryItemIds() == null ? List.of()
                : dto.getDeliveryItemIds().stream().filter(Objects::nonNull).distinct().toList();
        if (itemIds.isEmpty()) {
            throw new BusinessException("請至少選擇一個交付項");
        }
        if (dto.getTestLeadUserId() == null) {
            throw new BusinessException("請指定測試負責人");
        }
        if (!StringUtils.hasText(dto.getTestEnv())) {
            throw new BusinessException("請指定測試環境");
        }
        Long reqId = dto.getReqId();
        if (reqId != null) {
            requireFlowV3(reqId);
        }
        // 逐个校验交付项存在且状态允许提测；同时冻结范围快照
        List<RdmDeliveryItem> items = new ArrayList<>();
        for (Long itemId : itemIds) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            if (item == null) {
                throw new BusinessException("交付項不存在或已刪除: id=" + itemId);
            }
            /*
             * 提测前按事实重算一次交付项状态：按任務提測会在提测前才把任务归入默认交付项，
             * 任务已是 doing/done 但交付项仍停在 preparing 时，原来的状态校验会把合法提测误拒。
             * 重算以任务/测试/验收事实为准，不会把没有任务支撑的交付项凭空推进。
             */
            deliveryItemService.recalculateStatus(itemId);
            RdmDeliveryItem refreshed = deliveryItemMapper.selectById(itemId);
            if (refreshed != null) {
                item = refreshed;
            }
            if (!RdmConstants.DI_DEVELOPING.equals(item.getStatus())) {
                throw new BusinessException("交付項「" + item.getTitle() + "」當前狀態不可提測，僅「研發中」可提測");
            }
            if (reqId == null) {
                reqId = item.getReqId();
            }
            items.add(item);
        }
        if (reqId != null) {
            requireFlowV3(reqId);
        }

        RdmTestBatch batch = new RdmTestBatch();
        batch.setBatchNo(generateBatchNo());
        batch.setReqId(reqId);
        batch.setDeliveryItemIdsJson(JsonUtils.toJson(itemIds));
        // 范围快照由服务端按交付项重算，不采信前端传值（否则可提测后再偷偷改范围）
        batch.setScopeSnapshotJson(JsonUtils.toJson(buildScopeSnapshot(items)));
        batch.setBuildIdsJson(JsonUtils.toJson(dto.getBuildIds() == null ? List.of() : dto.getBuildIds()));
        // 用例集/构建映射草稿：仅暂存，权威冻结集在受理(accept)时由服务端规范化后写入 rdm_test_round
        batch.setCaseSnapshotJson(dto.getCaseSnapshotJson());
        batch.setBuildMappingJson(dto.getBuildMappingJson());
        batch.setTestEnv(dto.getTestEnv().trim());
        batch.setTestLeadUserId(dto.getTestLeadUserId());
        batch.setTestLeadUserName(dto.getTestLeadUserName());
        batch.setExecutorUserIdsJson(JsonUtils.toJson(
                dto.getExecutorUserIds() == null ? List.of() : dto.getExecutorUserIds()));
        batch.setPlanEndTime(parseDateTime(dto.getPlanEndTime()));
        batch.setStatus(RdmConstants.TB_PENDING);
        batch.setRoundNo(1);
        batch.setApplicantUserId(currentUserId);
        batch.setApplicantUserName(currentUserName);
        batchMapper.insert(batch);

        // 交付项进入测试中：提测即代表研发把控制权交给测试
        for (RdmDeliveryItem item : items) {
            item.setStatus(RdmConstants.DI_TESTING);
            deliveryItemMapper.updateById(item);
        }
        log.info("提測批次已提交: batchNo={}, reqId={}, items={}, applicant={}",
                batch.getBatchNo(), reqId, itemIds.size(), currentUserName);
        return batch;
    }

    /**
     * 接收提测批次（测试负责人操作）：pending → executing，并<b>冻结一条不可变测试轮次</b>。
     * <p>受理即冻结（A.1）：范围(scopeVersion)/PRD/验收标准/构建/环境/用例集(稳定 caseId + mandatory 必测标记)/
     * 冻结人/冻结时间；batchId+roundNo 唯一，一经写入不可变，此后门禁只认冻结集。
     * <p>以 executeOnce 保证并发/重试下只冻结一次（resourceKey=test_batch:{id}，clientRequestId=accept:round{n}，
     * 服务端派生键，受理无请求体）。executeOnce 自身即事务边界，实际逻辑落在 {@link #doAcceptBatch}。
     */
    public void acceptBatch(Long batchId, Long currentUserId) {
        RdmTestBatch batch = requireBatch(batchId);
        int roundNo = batch.getRoundNo() == null ? 1 : batch.getRoundNo();
        IdempotentKey key = IdempotentKey.builder()
                .userId(currentUserId)
                .bizType(BIZ_TEST_ACCEPT)
                .resourceKey("test_batch:" + batchId)
                .clientRequestId("accept:round" + roundNo)
                .requestHash(idempotentService.stableRequestHash(List.of(
                        "accept", String.valueOf(batchId), String.valueOf(roundNo), String.valueOf(currentUserId))))
                .build();
        idempotentService.executeOnce(key, () -> {
            doAcceptBatch(batchId, currentUserId);
            return null;
        }, Void.class);
    }

    /** 受理提测批次的实际逻辑（事务内）：资格/状态校验 + 冻结不可变测试轮次 + 状态推进。 */
    @Transactional(rollbackFor = Exception.class)
    public void doAcceptBatch(Long batchId, Long currentUserId) {
        RdmTestBatch batch = requireBatch(batchId);
        requireTestLead(batch, currentUserId, "接收提測批次");
        if (!RdmConstants.TB_PENDING.equals(batch.getStatus())) {
            throw new BusinessException("僅「待接收」的提測批次可接收，當前狀態：" + batch.getStatus());
        }
        int roundNo = batch.getRoundNo() == null ? 1 : batch.getRoundNo();
        // 受理即冻结不可变测试轮次（batchId+roundNo 唯一，拒绝空用例集）
        freezeTestRound(batch, roundNo, currentUserId);
        batch.setStatus(RdmConstants.TB_EXECUTING);
        batchMapper.updateById(batch);
        log.info("提測批次已接收並進入執行、輪次已凍結: batchNo={}, round={}, testLead={}",
                batch.getBatchNo(), roundNo, currentUserId);
    }

    /**
     * 团队负载页分派：把选定人员追加为「待受理(pending)」提测批次的执行人。
     * <p><b>轮次冻结保护</b>：仅 pending 可改执行人；一旦受理（executing/passed/failed/returned）用例集与
     * 执行人已冻结到 rdm_test_round，绝不可从负载页临时加人（换人走已有复测新轮路径，旧轮次只读保留）。
     * <p>权限与受理同源的 {@code requireTestLead}（仅本批次测试负责人或全量授权者）；并发以 {@code @Version}
     * 乐观锁条件（expected 不一致则 {@code CONFLICT}），不靠读后写。
     */
    @Transactional(rollbackFor = Exception.class)
    public void assignExecutors(Long batchId, List<Long> executorUserIds, Integer expectedVersion, Long currentUserId) {
        if (batchId == null || executorUserIds == null || executorUserIds.isEmpty()) {
            throw new BusinessException("請選擇批次與被指派的執行人");
        }
        RdmTestBatch batch = requireBatch(batchId);
        // 权威守卫：只有本批次测试负责人（或全量授权）可指派执行人
        requireTestLead(batch, currentUserId, "指派測試執行人");
        // 冻结轮次保护：仅待受理批次可改执行人
        if (!RdmConstants.TB_PENDING.equals(batch.getStatus())) {
            throw new BusinessException("僅「待受理」的提測批次可從負載頁指派執行人；已受理的輪次已凍結，换人請走複測新輪");
        }
        // 合并现有执行人 + 去重（保留已登记的，追加新指派的）
        List<Long> merged = new ArrayList<>(JsonUtils.parseLongList(batch.getExecutorUserIdsJson()));
        for (Long uid : executorUserIds) {
            if (uid != null && !merged.contains(uid)) {
                merged.add(uid);
            }
        }
        int expected = expectedVersion != null ? expectedVersion : (batch.getVersion() == null ? 0 : batch.getVersion());
        int affected = batchMapper.update(null, new LambdaUpdateWrapper<RdmTestBatch>()
                .eq(RdmTestBatch::getId, batch.getId())
                .eq(RdmTestBatch::getVersion, expected)
                .eq(RdmTestBatch::getStatus, RdmConstants.TB_PENDING)
                .set(RdmTestBatch::getExecutorUserIdsJson, JsonUtils.toJson(merged))
                .set(RdmTestBatch::getVersion, expected + 1));
        if (affected == 0) {
            throw new BusinessException(ResultCode.CONFLICT.getCode(), "批次已被他人修改或已受理，請刷新後重試");
        }
        log.info("负载页指派測試執行人: batchNo={}, executors={}, operator={}",
                batch.getBatchNo(), merged, currentUserId);
    }

    /**
     * 退回提测批次（测试负责人操作）：pending → returned，必须留退回原因。
     */
    @Transactional(rollbackFor = Exception.class)
    public void returnBatch(Long batchId, RdmTestBatchDTO.Return dto, Long currentUserId) {
        RdmTestBatch batch = requireBatch(batchId);
        requireTestLead(batch, currentUserId, "退回提測批次");
        if (!RdmConstants.TB_PENDING.equals(batch.getStatus())) {
            throw new BusinessException("僅「待接收」的提測批次可退回，當前狀態：" + batch.getStatus());
        }
        String reason = dto == null ? null : trimToNull(dto.getReason());
        if (reason == null) {
            throw new BusinessException("退回提測必須填寫退回原因");
        }
        batch.setStatus(RdmConstants.TB_RETURNED);
        batch.setReturnedReason(reason);
        batchMapper.updateById(batch);
        // 交付项退回研发中：提测被拒说明还没达到可测标准
        for (Long itemId : itemIdsOf(batch)) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
            if (item != null && RdmConstants.DI_TESTING.equals(item.getStatus())) {
                item.setStatus(RdmConstants.DI_DEVELOPING);
                deliveryItemMapper.updateById(item);
            }
        }
        log.info("提測批次已退回: batchNo={}, reason={}", batch.getBatchNo(), reason);
    }

    /**
     * 录入测试执行结果（多人追加执行）。
     * <p>以 executeOnce 保证并发/重试下同一执行只落库一次；服务端派生键：
     * resourceKey={@code test_batch:{id}}，clientRequestId={@code exec:round{n}:{caseId}:{判别子}}
     * （判别子优先取 DTO.requestId，缺省退化为请求内容稳定哈希），requestHash=执行内容稳定哈希。
     * executeOnce 自身即事务边界，实际逻辑落在 {@link #doSubmitExecution}（不可包在外层活动事务里）。
     */
    public RdmTestExecution submitExecution(Long batchId, RdmTestBatchDTO.Execute dto,
                                            Long currentUserId, String currentUserName) {
        if (currentUserId == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        RdmTestBatch batch = requireBatch(batchId);
        int roundNo = batch.getRoundNo() == null ? 1 : batch.getRoundNo();
        String caseId = dto == null ? null : trimToNull(dto.getCaseId());
        String result = dto == null ? null : trimToNull(dto.getResult());
        Long itemId = dto == null ? null : dto.getDeliveryItemId();
        // 判别子：优先客户端 requestId（重试保持不变）；缺省用内容哈希，令「同内容重试」收敛、「不同结果追加」区分
        String discriminator = (dto != null && StringUtils.hasText(dto.getRequestId()))
                ? dto.getRequestId().trim()
                : idempotentService.stableRequestHash(List.of("exec-content",
                        String.valueOf(batchId), String.valueOf(roundNo), String.valueOf(caseId),
                        String.valueOf(result), String.valueOf(itemId), String.valueOf(currentUserId)));
        IdempotentKey key = IdempotentKey.builder()
                .userId(currentUserId)
                .bizType(BIZ_TEST_EXEC)
                .resourceKey("test_batch:" + batchId)
                .clientRequestId("exec:round" + roundNo + ":" + caseId + ":" + discriminator)
                .requestHash(idempotentService.stableRequestHash(List.of("exec",
                        String.valueOf(batchId), String.valueOf(roundNo), String.valueOf(caseId),
                        String.valueOf(result), String.valueOf(itemId), String.valueOf(currentUserId))))
                .build();
        return idempotentService.executeOnce(key,
                () -> doSubmitExecution(batchId, dto, currentUserId, currentUserName), RdmTestExecution.class);
    }

    /**
     * 录入执行结果的实际逻辑（事务内）。
     * <p>A.2 多人追加执行：状态放宽为 executing <b>或 failed</b> 都可继续录入（同轮某用例判 fail 后，
     * 其他人仍可录入别的用例，不因第一条 fail 终止整批录入）；翻案只能走复测新轮。
     * <p>A.1/A.5 门禁映射 fail-closed：执行必须映射到<b>当前轮次冻结用例集</b>里的稳定 caseId，
     * 映射不到即拒绝（不用 caseTitle 模糊派生兜底、不静默接收）；scopeVersion 以冻结用例为权威，
     * 客户端传值不一致即拒绝；构建/环境须属于当前批次的当前轮次。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmTestExecution doSubmitExecution(Long batchId, RdmTestBatchDTO.Execute dto,
                                              Long currentUserId, String currentUserName) {
        RdmTestBatch batch = requireBatch(batchId);
        if (!RdmConstants.TB_EXECUTING.equals(batch.getStatus())
                && !RdmConstants.TB_FAILED.equals(batch.getStatus())) {
            throw new BusinessException("僅「執行中」或「未通過」的提測批次可錄入結果，當前狀態：" + batch.getStatus());
        }
        requireExecutor(batch, currentUserId, "錄入測試結果");
        if (dto == null || !StringUtils.hasText(dto.getResult())) {
            throw new BusinessException("請填寫測試結果");
        }
        String result = dto.getResult().trim();
        if (!RESULTS.contains(result)) {
            throw new BusinessException("非法的測試結果: " + result);
        }

        // 当前轮次冻结事实（受理时冻结，未冻结不得录入）
        RdmTestRound round = requireCurrentRound(batch);
        Long itemId = dto.getDeliveryItemId();
        if (itemId == null) {
            throw new BusinessException("請指定執行所屬交付項");
        }
        if (!itemIdsOf(batch).contains(itemId)) {
            throw new BusinessException("交付項不屬於本提測批次，拒絕錄入（防止張冠李戴）: deliveryItemId=" + itemId);
        }

        // A.5 fail-closed：caseId 必须映射到当前轮次冻结用例集
        String caseId = trimToNull(dto.getCaseId());
        if (caseId == null) {
            throw new BusinessException("新版測試流錄入結果必須攜帶 caseId，並映射到當前輪次凍結用例集");
        }
        Map<String, Object> frozenCase = findFrozenCase(round, itemId, caseId);
        if (frozenCase == null) {
            throw new BusinessException("caseId 未映射到當前輪次凍結用例集，拒絕錄入（fail-closed）: caseId=" + caseId);
        }
        // scopeVersion 以冻结用例为权威，客户端传值不一致即拒绝（不信任前端）
        Integer authoritativeScope = toInt(frozenCase.get("scopeVersion"));
        if (dto.getScopeVersion() != null && !dto.getScopeVersion().equals(authoritativeScope)) {
            throw new BusinessException("scopeVersion 以凍結輪次為權威，客戶端傳值不一致，拒絕錄入：傳入="
                    + dto.getScopeVersion() + "，凍結=" + authoritativeScope);
        }
        String buildId = resolveBuildId(batch, round, dto.getBuildId());
        String testEnv = resolveTestEnv(batch, round, dto.getTestEnv());

        RdmTestExecution exec = new RdmTestExecution();
        exec.setBatchId(batchId);
        exec.setDeliveryItemId(itemId);
        exec.setCaseTitle(StringUtils.hasText(dto.getCaseTitle()) ? dto.getCaseTitle()
                : Objects.toString(frozenCase.get("caseTitle"), null));
        exec.setExecutorUserId(currentUserId);
        exec.setExecutorUserName(currentUserName);
        exec.setBuildId(buildId);
        exec.setTestEnv(testEnv);
        exec.setResult(result);
        exec.setExecutedAt(LocalDateTime.now());
        exec.setRemark(dto.getRemark());
        exec.setRoundNo(round.getRoundNo() == null ? batch.getRoundNo() : round.getRoundNo());
        // Batch 3 门禁映射事实：caseId/轮次/范围版本/证据/幂等请求ID
        exec.setCaseId(caseId);
        exec.setTestRoundId(round.getId());
        exec.setScopeVersion(authoritativeScope);
        exec.setEvidenceJson(dto.getEvidenceJson());
        exec.setRequestId(dto.getRequestId());
        executionMapper.insert(exec);

        recalculateBatchStatus(batch);
        /*
         * 測試事實變了，交付項狀態必須同步重算：recalculateStatus 只在手動接口與新範圍版本時觸發，
         * 不補這一步，V3 階段條與驗收隊列會看着「測試已通過但交付項還在測試中」的陳舊狀態。
         */
        deliveryItemService.recalculateStatus(itemId);
        log.info("測試執行記錄已錄入: batchNo={}, round={}, result={}, caseId={}, item={}",
                batch.getBatchNo(), exec.getRoundNo(), result, caseId, itemId);
        return exec;
    }

    /**
     * 发起复测（新轮次）：round_no+1，旧记录只读保留，更新构建标识，状态重置为 executing，
     * 并为新轮次<b>重新冻结一条不可变测试轮次</b>（旧轮次只读保留，翻案走新轮）。
     * <p>以 executeOnce 保证并发/重试下同一复测只推进一次；服务端派生键：
     * resourceKey={@code test_batch:{id}}，clientRequestId={@code retest:round{n}:{判别子}}。
     */
    public void retestBatch(Long batchId, RdmTestBatchDTO.Retest dto, Long currentUserId) {
        if (currentUserId == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        RdmTestBatch batch = requireBatch(batchId);
        int nextRound = (batch.getRoundNo() == null ? 1 : batch.getRoundNo()) + 1;
        String reason = dto == null ? null : trimToNull(dto.getReason());
        String discriminator = (dto != null && StringUtils.hasText(dto.getRequestId()))
                ? dto.getRequestId().trim()
                : idempotentService.stableRequestHash(List.of("retest-content",
                        String.valueOf(batchId), String.valueOf(nextRound), String.valueOf(reason),
                        dto == null || dto.getBuildIds() == null ? "[]" : JsonUtils.toJson(dto.getBuildIds())));
        IdempotentKey key = IdempotentKey.builder()
                .userId(currentUserId)
                .bizType(BIZ_TEST_RETEST)
                .resourceKey("test_batch:" + batchId)
                .clientRequestId("retest:round" + nextRound + ":" + discriminator)
                .requestHash(idempotentService.stableRequestHash(List.of("retest",
                        String.valueOf(batchId), String.valueOf(nextRound), String.valueOf(reason), String.valueOf(currentUserId))))
                .build();
        idempotentService.executeOnce(key, () -> {
            doRetestBatch(batchId, dto, currentUserId);
            return null;
        }, Void.class);
    }

    /** 发起复测的实际逻辑（事务内）：资格/状态校验 + 轮次推进 + 新轮次冻结。 */
    @Transactional(rollbackFor = Exception.class)
    public void doRetestBatch(Long batchId, RdmTestBatchDTO.Retest dto, Long currentUserId) {
        RdmTestBatch batch = requireBatch(batchId);
        requireTestLead(batch, currentUserId, "發起複測");
        if (!RdmConstants.TB_EXECUTING.equals(batch.getStatus())
                && !RdmConstants.TB_FAILED.equals(batch.getStatus())) {
            throw new BusinessException("僅「執行中」或「未通過」的批次可發起複測，當前狀態：" + batch.getStatus());
        }
        if (dto == null || !StringUtils.hasText(dto.getReason())) {
            throw new BusinessException("發起複測必須填寫重測原因");
        }
        int nextRound = (batch.getRoundNo() == null ? 1 : batch.getRoundNo()) + 1;
        batch.setRoundNo(nextRound);
        if (dto.getBuildIds() != null && !dto.getBuildIds().isEmpty()) {
            batch.setBuildIdsJson(JsonUtils.toJson(dto.getBuildIds()));
        }
        batch.setStatus(RdmConstants.TB_EXECUTING);
        // 为新轮次冻结不可变测试轮次（旧轮次只读保留）；用例集沿用同一草稿，确定性 caseId 跨轮对齐
        freezeTestRound(batch, nextRound, currentUserId);
        batchMapper.updateById(batch);
        log.info("提測批次發起複測並凍結新輪次: batchNo={}, round={}, reason={}",
                batch.getBatchNo(), nextRound, dto.getReason());
    }

    /* ==================== 查询 ==================== */

    /** 分页查询提测批次；非全量授权者只看与自己相关（负责/执行/申请）的批次。 */
    public Page<RdmTestBatchVO.ListItem> listBatches(RdmTestBatchDTO.Query query, Long currentUserId) {
        RdmTestBatchDTO.Query q = query == null ? new RdmTestBatchDTO.Query() : query;
        Page<RdmTestBatch> page = new Page<>(normalizePage(q.getPageNo()), normalizeSize(q.getPageSize()));
        LambdaQueryWrapper<RdmTestBatch> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(q.getReqId() != null, RdmTestBatch::getReqId, q.getReqId());
        wrapper.eq(StringUtils.hasText(q.getStatus()), RdmTestBatch::getStatus, q.getStatus());
        wrapper.eq(q.getTestLeadUserId() != null, RdmTestBatch::getTestLeadUserId, q.getTestLeadUserId());
        if (StringUtils.hasText(q.getKeyword())) {
            String kw = q.getKeyword().trim();
            wrapper.and(w -> w.like(RdmTestBatch::getBatchNo, kw)
                    .or().like(RdmTestBatch::getTestEnv, kw)
                    .or().like(RdmTestBatch::getTestLeadUserName, kw));
        }
        // 計劃結束時間區間：前端 RangePicker 的日期是「日」，含起止當天
        try {
            if (StringUtils.hasText(q.getPlanEndFrom())) {
                wrapper.ge(RdmTestBatch::getPlanEndTime, LocalDate.parse(q.getPlanEndFrom().trim()).atStartOfDay());
            }
            if (StringUtils.hasText(q.getPlanEndTo())) {
                wrapper.le(RdmTestBatch::getPlanEndTime, LocalDate.parse(q.getPlanEndTo().trim()).atTime(23, 59, 59));
            }
        } catch (DateTimeParseException e) {
            throw new BusinessException("計劃結束時間格式應為 yyyy-MM-dd");
        }
        if (!canSeeAll() && currentUserId != null) {
            String uid = String.valueOf(currentUserId);
            wrapper.and(w -> w.eq(RdmTestBatch::getTestLeadUserId, currentUserId)
                    .or().eq(RdmTestBatch::getApplicantUserId, currentUserId)
                    .or().like(RdmTestBatch::getExecutorUserIdsJson, uid));
        }
        wrapper.orderByDesc(RdmTestBatch::getId);
        Page<RdmTestBatch> result = batchMapper.selectPage(page, wrapper);
        List<RdmTestBatch> rows = result.getRecords();

        // 一次性捞本页批次的执行记录与关联信息，避免逐行 N+1
        Map<Long, List<RdmTestExecution>> execByBatch = loadExecutionsByBatch(
                rows.stream().map(RdmTestBatch::getId).toList());
        Map<Long, String> reqTitleMap = loadReqTitles(rows.stream().map(RdmTestBatch::getReqId).toList());
        Map<Long, String> reqNoMap = loadReqNos(rows.stream().map(RdmTestBatch::getReqId).toList());

        Page<RdmTestBatchVO.ListItem> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(rows.stream()
                .map(b -> toListItem(b, execByBatch.getOrDefault(b.getId(), List.of()), reqTitleMap, reqNoMap))
                .toList());
        return voPage;
    }

    /** 批次详情（含全部执行记录，按执行时间升序）。 */
    public RdmTestBatchVO.Detail getBatchDetail(Long batchId, Long currentUserId) {
        RdmTestBatch batch = requireBatch(batchId);
        List<RdmTestExecution> execs = executionMapper.selectList(new LambdaQueryWrapper<RdmTestExecution>()
                .eq(RdmTestExecution::getBatchId, batchId)
                .orderByAsc(RdmTestExecution::getExecutedAt)
                .orderByAsc(RdmTestExecution::getId));
        List<Long> itemIds = itemIdsOf(batch);
        Map<Long, String> itemTitleMap = loadItemTitles(itemIds);
        RdmRequirement req = batch.getReqId() == null ? null : requirementMapper.selectById(batch.getReqId());

        RdmTestBatchVO.Detail detail = new RdmTestBatchVO.Detail();
        detail.setId(batch.getId());
        detail.setBatchNo(batch.getBatchNo());
        detail.setReqId(batch.getReqId());
        detail.setReqTitle(req == null ? null : req.getTitle());
        detail.setReqNo(req == null ? null : req.getReqNo());
        detail.setDeliveryItemTitles(itemIds.stream()
                .map(id -> itemTitleMap.getOrDefault(id, "")).filter(StringUtils::hasText).toList());
        detail.setTestEnv(batch.getTestEnv());
        detail.setTestLeadUserName(batch.getTestLeadUserName());
        detail.setStatus(batch.getStatus());
        detail.setRoundNo(batch.getRoundNo());
        detail.setPlanEndTime(DateTimeUtils.format(batch.getPlanEndTime()));
        detail.setCreatedAt(DateTimeUtils.format(batch.getCreatedAt()));
        detail.setUpdatedAt(DateTimeUtils.format(batch.getUpdatedAt()));
        detail.setScopeSnapshotJson(batch.getScopeSnapshotJson());
        detail.setBuildIdsJson(batch.getBuildIdsJson());
        detail.setExecutorUserIds(JsonUtils.parseLongList(batch.getExecutorUserIdsJson()));
        // 执行人只存了 ID，展示签名由服务端一次 IN 查补齐：前端拿裸 ID 只能显成数字串
        detail.setExecutorUserNames(operatorResolver.signaturesByIds(detail.getExecutorUserIds()));
        detail.setApplicantUserName(batch.getApplicantUserName());
        detail.setReturnedReason(batch.getReturnedReason());
        // Batch 3 新事实字段（供任务23 前端回传 expectedVersion / 展示草稿）
        detail.setVersion(batch.getVersion());
        detail.setCaseSnapshotJson(batch.getCaseSnapshotJson());
        detail.setBuildMappingJson(batch.getBuildMappingJson());

        int[] counts = countCurrentRound(execs, batch.getRoundNo());
        detail.setPassCount(counts[0]);
        detail.setFailCount(counts[1]);
        detail.setTotalCount(counts[2]);
        detail.setExecutions(execs.stream().map(e -> toExecutionRecord(e, itemTitleMap)).toList());
        detail.setFrozenCases(frozenCaseEntries(batch, execs, itemTitleMap));
        return detail;
    }

    /**
     * 把当前轮次的冻结用例集连同服务端 caseId 输出给前端。
     * <p>为什么是读接口而不是让前端自己算：caseId 由 {@link #deriveCaseId} 用 sha256 截位生成，
     * 前端重算等于把服务端的去重/跳轮对齐规则复制一份（必然漂移）；不输出则前端根拿不到合法值，
     * 而 submitExecution 又 fail-closed 地要求 caseId 必须命中冻结集 —— 两者叠加就是「提测结录不进去」。
     * <p>未受理（无冻结轮次）时返回空列表，不抛错：详情页在 pending 阶段也要能打开。
     */
    private List<RdmTestBatchVO.CaseEntry> frozenCaseEntries(RdmTestBatch batch,
                                                            List<RdmTestExecution> execs,
                                                            Map<Long, String> itemTitleMap) {
        RdmTestRound round = currentFrozenRound(batch);
        if (round == null) {
            return List.of();
        }
        List<RdmTestBatchVO.CaseEntry> out = new ArrayList<>();
        for (Map<String, Object> c : JsonUtils.parseMapList(round.getCaseSnapshotJson())) {
            Long itemId = toLong(Objects.toString(c.get("deliveryItemId"), null));
            String caseId = Objects.toString(c.get("caseId"), null);
            if (itemId == null || !StringUtils.hasText(caseId)) {
                continue;
            }
            RdmTestBatchVO.CaseEntry entry = new RdmTestBatchVO.CaseEntry();
            entry.setDeliveryItemId(itemId);
            entry.setDeliveryItemTitle(itemTitleMap.getOrDefault(itemId, ""));
            entry.setCaseId(caseId);
            entry.setCaseTitle(Objects.toString(c.get("caseTitle"), null));
            entry.setScopeVersion(toInt(c.get("scopeVersion")));
            entry.setMandatory(toBool(c.get("mandatory")));
            List<RdmTestExecution> caseExecs = execs.stream()
                    .filter(x -> itemId.equals(x.getDeliveryItemId())
                            && caseId.equals(x.getCaseId())
                            && Objects.equals(round.getRoundNo(), x.getRoundNo()))
                    .toList();
            entry.setEffectiveResult(effectiveCaseResult(caseExecs));
            out.add(entry);
        }
        return out;
    }

    /** 批次执行摘要统计（按当前轮次口径，供测试工作台进度条使用）。 */
    public RdmTestBatchVO.BatchSummary getBatchSummary(Long batchId) {
        RdmTestBatch batch = requireBatch(batchId);
        Integer round = batch.getRoundNo();
        List<RdmTestExecution> execs = executionMapper.selectList(new LambdaQueryWrapper<RdmTestExecution>()
                .eq(RdmTestExecution::getBatchId, batchId)
                .eq(round != null, RdmTestExecution::getRoundNo, round));
        /*
         * 分母必须是「受理时冻结的用例集」，不是执行记录条数：
         * 受理后到第一条结果录完之前，执行记录为 0，但必测用例集已经冻结（可能 1 条），
         * 此时摘要显示「總用例數 0」与冻结事实矛盾；同一用例重复录入也会把总数吹大。
         * 未冻结（未受理）的旧批次仍按执行条数回退，不改变历史口径。
         */
        RdmTestRound frozenRound = currentFrozenRound(batch);
        Set<String> frozenCaseIds = new LinkedHashSet<>();
        if (frozenRound != null) {
            for (Map<String, Object> c : JsonUtils.parseMapList(frozenRound.getCaseSnapshotJson())) {
                String cid = trimToNull(Objects.toString(c.get("caseId"), null));
                if (cid != null) {
                    frozenCaseIds.add(cid);
                }
            }
        }
        // 同一 caseId 多次录入时以最后一条为准（复测/重录不得重复计数）
        Map<String, String> latestResultByCase = new LinkedHashMap<>();
        int legacyPass = 0, legacyFail = 0, legacyBlocked = 0, legacySkip = 0;
        for (RdmTestExecution e : execs) {
            String result = e.getResult() == null ? "" : e.getResult();
            String caseId = trimToNull(e.getCaseId());
            if (frozenRound != null && caseId != null) {
                latestResultByCase.put(caseId, result);
                continue;
            }
            switch (result) {
                case RESULT_PASS -> legacyPass++;
                case RESULT_FAIL -> legacyFail++;
                case RESULT_BLOCKED -> legacyBlocked++;
                case RESULT_SKIP -> legacySkip++;
                default -> { }
            }
        }
        int pass = 0, fail = 0, blocked = 0, skip = 0;
        if (frozenRound != null) {
            for (String result : latestResultByCase.values()) {
                switch (result) {
                    case RESULT_PASS -> pass++;
                    case RESULT_FAIL -> fail++;
                    case RESULT_BLOCKED -> blocked++;
                    case RESULT_SKIP -> skip++;
                    default -> { }
                }
            }
        } else {
            pass = legacyPass;
            fail = legacyFail;
            blocked = legacyBlocked;
            skip = legacySkip;
        }
        int executed = pass + fail + blocked; // skip 视为「必测未执行」
        int total = frozenRound != null ? frozenCaseIds.size() : execs.size();
        RdmTestBatchVO.BatchSummary summary = new RdmTestBatchVO.BatchSummary();
        summary.setTotalCases(total);
        summary.setExecutedCases(executed);
        summary.setPassedCases(pass);
        summary.setFailedCases(fail);
        summary.setBlockedCases(blocked);
        summary.setSkippedCases(skip);
        summary.setNotExecutedCases(Math.max(total - executed - skip, 0));
        summary.setPassRate(executed == 0 ? 0 : (int) Math.round(pass * 100.0 / executed));
        return summary;
    }

    /**
     * 放行闸门：交付项测试是否通过（A.5/A.6/A.7/A.8）。
     * <p>口径由服务端算：<b>存在一个未因范围变更失效的有效提测批次，其当前冻结轮次内
     * 该交付项的全部必测用例均 pass</b>（无 fail/blocked/skip、至少一条 pass），<b>且无 critical/major 未闭环问题</b>。
     * <ul>
     *   <li>A.5 分母是冻结的唯一 caseId（mandatory 必测全 pass），<b>不是执行记录条数</b>；</li>
     *   <li>A.7 <b>绝不从 QA 任务 100% 推导测试通过</b>：无有效批次或无冻结轮次 → 恒 false；</li>
     *   <li>A.8 消费证据失效：委派共享 {@link EvidenceValidityResolver} 过滤已因范围变更失效的提测批次，
     *       范围变更后旧提测批次登记失效即不再作为门禁凭证。</li>
     * </ul>
     * <p><b>任务33</b>：失效过滤语义已统一抽取到 {@link EvidenceValidityResolver}，与 {@link RdmDeliveryItemService}、
     * {@link RdmAcceptanceRecordService} 三处共用同一实现，杜绝漂移。
     */
    public boolean isTestPassed(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return false;
        }
        // A.8 只认未失效的有效批次（复刻任务19 失效过滤语义）
        List<RdmTestBatch> validBatches = loadValidTestBatchesForItem(deliveryItemId);
        if (validBatches.isEmpty()) {
            return false; // A.7 无有效批次 → 恒 false，绝不从任务进度推导
        }
        boolean anyRoundPassed = false;
        for (RdmTestBatch batch : validBatches) {
            RdmTestRound round = currentFrozenRound(batch);
            if (round == null) {
                continue; // 未冻结轮次（尚未受理）不算通过
            }
            if (isRoundPassedForItem(round, deliveryItemId)) {
                anyRoundPassed = true;
                break;
            }
        }
        if (!anyRoundPassed) {
            return false;
        }
        Long blocking = issueMapper.selectCount(new LambdaQueryWrapper<RdmIssue>()
                .eq(RdmIssue::getDeliveryItemId, deliveryItemId)
                .in(RdmIssue::getSeverity, RdmConstants.SEV_CRITICAL, RdmConstants.SEV_MAJOR)
                .notIn(RdmIssue::getStatus, RdmConstants.ISSUE_RESOLVED, RdmConstants.ISSUE_DEFERRED));
        return blocking == null || blocking == 0;
    }

    /* ==================== 私有辅助 ==================== */

    /** 门禁聚合哨兵：未执行 / 未通过（skip 或混合），二者都 ≠ pass */
    private static final String EFFECTIVE_NOT_EXECUTED = "not_executed";
    private static final String EFFECTIVE_NOT_PASSED = "not_passed";

    /**
     * 录入执行结果后重算批次状态（A.6 部分交付独立判断）。
     * <p>逐交付项按当前冻结轮次独立判定：某项全部必测用例 pass 即推进该项至 pending_acceptance（即使整批尚未全通过）；
     * 全部交付项通过 → passed；存在阻断（fail/blocked）→ failed；其余保持 executing。
     */
    private void recalculateBatchStatus(RdmTestBatch batch) {
        RdmTestRound round = currentFrozenRound(batch);
        List<Long> itemIds = itemIdsOf(batch);
        boolean allPassed = !itemIds.isEmpty();
        boolean anyBlocking = false;
        for (Long itemId : itemIds) {
            boolean itemPassed = round != null && isRoundPassedForItem(round, itemId);
            if (itemPassed) {
                advanceItemToPendingAcceptance(itemId); // A.6 部分交付独立推进
            } else {
                allPassed = false;
                if (hasBlockingInRound(round, itemId)) {
                    anyBlocking = true;
                }
            }
        }
        String target = allPassed ? RdmConstants.TB_PASSED
                : (anyBlocking ? RdmConstants.TB_FAILED : RdmConstants.TB_EXECUTING);
        if (!target.equals(batch.getStatus())) {
            batch.setStatus(target);
            batchMapper.updateById(batch);
        }
    }

    /**
     * 受理即冻结一条不可变测试轮次（A.1）：batchId+roundNo 唯一，一经写入不可变。
     * <p>规范化用例集（服务端权威：缺失 caseId 按确定性规则分配、mandatory 由服务端判定、回填 scopeVersion），
     * 拒绝空用例集；写入后该冻结集即门禁唯一权威分母。
     */
    private void freezeTestRound(RdmTestBatch batch, int roundNo, Long currentUserId) {
        Long dup = testRoundMapper.selectCount(new LambdaQueryWrapper<RdmTestRound>()
                .eq(RdmTestRound::getBatchId, batch.getId())
                .eq(RdmTestRound::getRoundNo, roundNo));
        if (dup != null && dup > 0) {
            throw new BusinessException("該提測批次輪次已凍結，不可重複凍結或修改（不可變事實）: round=" + roundNo);
        }
        List<Long> itemIds = itemIdsOf(batch);
        Map<Long, Integer> scopeByItem = scopeVersionByItem(itemIds);
        List<Map<String, Object>> cases = normalizeCaseSnapshot(batch.getCaseSnapshotJson(), scopeByItem);
        if (cases.isEmpty()) {
            // 拒绝空冻结用例集（否则 isTestPassed 恒 false / 恒 true 都不可接受）；
            // 同时给出自救路径：提测已把交付项置 testing，不回退就无法重新提测
            throw new BusinessException("拒絕凍結空用例集：受理提測必須有規範化後的必測用例集"
                    + "（請退回本批次，在提測表單補充測試用例後重新提測）");
        }
        String caseSnapshotJson = JsonUtils.toJson(cases);
        String buildMappingJson = StringUtils.hasText(batch.getBuildMappingJson())
                ? batch.getBuildMappingJson() : buildDefaultBuildMapping(itemIds, batch);
        RdmTestRound round = new RdmTestRound();
        round.setBatchId(batch.getId());
        round.setRoundNo(roundNo);
        round.setScopeSnapshotJson(batch.getScopeSnapshotJson());
        round.setBuildMappingJson(buildMappingJson);
        round.setTestEnv(batch.getTestEnv());
        round.setCaseSnapshotJson(caseSnapshotJson);
        round.setExecutorUserIdsJson(batch.getExecutorUserIdsJson());
        round.setFrozenAt(LocalDateTime.now());
        round.setFrozenBy(currentUserId);
        round.setEvidenceHash(RdmIdempotentService.sha256Hex(String.join("|",
                String.valueOf(batch.getId()), String.valueOf(roundNo),
                String.valueOf(batch.getScopeSnapshotJson()), buildMappingJson,
                String.valueOf(batch.getTestEnv()), caseSnapshotJson)));
        testRoundMapper.insert(round);
    }

    /**
     * 规范化用例草稿为不可变冻结集（服务端权威）：
     * <ul>
     *   <li>只保留属于本批次的交付项的用例（越界/张冠李戴不冻结）；</li>
     *   <li>缺失 caseId 按<b>确定性规则</b>分配（deliveryItemId + 规范化 caseTitle + 序号 的稳定哈希），同输入同 caseId、跨轮可对齐；</li>
     *   <li><b>mandatory 一律服务端判 true</b>（前端 optional 提示不采信，防止把必测翻成非必测弱化门禁）；</li>
     *   <li>回填交付项当前 scopeVersion；按 caseId 去重。</li>
     * </ul>
     */
    private List<Map<String, Object>> normalizeCaseSnapshot(String draftJson, Map<Long, Integer> scopeByItem) {
        List<Map<String, Object>> draft = JsonUtils.parseMapList(draftJson);
        List<Map<String, Object>> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        Map<Long, Integer> seqByItem = new LinkedHashMap<>();
        for (Map<String, Object> entry : draft) {
            Long itemId = toLong(Objects.toString(entry.get("deliveryItemId"), null));
            if (itemId == null || !scopeByItem.containsKey(itemId)) {
                continue; // 不属于本批次的用例不冻结
            }
            String title = normalizeTitle(Objects.toString(entry.get("caseTitle"), null));
            int seq = seqByItem.merge(itemId, 1, Integer::sum) - 1; // 每项 0-based 序号，确定性
            String provided = trimToNull(Objects.toString(entry.get("caseId"), null));
            String caseId = provided != null ? provided : deriveCaseId(itemId, title, seq);
            if (!seen.add(caseId)) {
                continue; // 去重同 caseId
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("deliveryItemId", itemId);
            row.put("caseId", caseId);
            row.put("caseTitle", title);
            row.put("mandatory", Boolean.TRUE); // 服务端判定：缺省必测
            row.put("scopeVersion", scopeByItem.get(itemId));
            result.add(row);
        }
        return result;
    }

    /** 确定性 caseId：同交付项+同规范化标题+同序号 → 同 caseId（跨轮对齐）。 */
    private String deriveCaseId(Long itemId, String normalizedTitle, int seq) {
        String raw = itemId + "|" + normalizedTitle + "|" + seq;
        return "C-" + itemId + "-" + RdmIdempotentService.sha256Hex(raw).substring(0, 12);
    }

    private String normalizeTitle(String title) {
        return title == null ? "" : title.trim().replaceAll("\\s+", " ");
    }

    private Map<Long, Integer> scopeVersionByItem(List<Long> itemIds) {
        Map<Long, Integer> map = new LinkedHashMap<>();
        if (itemIds == null || itemIds.isEmpty()) {
            return map;
        }
        for (RdmDeliveryItem it : deliveryItemMapper.selectList(new LambdaQueryWrapper<RdmDeliveryItem>()
                .in(RdmDeliveryItem::getId, itemIds))) {
            map.put(it.getId(), it.getScopeVersion());
        }
        return map;
    }

    /** 无显式构建映射草稿时的默认映射：每交付项 → 批次首个构建。 */
    private String buildDefaultBuildMapping(List<Long> itemIds, RdmTestBatch batch) {
        List<String> buildIds = JsonUtils.parseStringList(batch.getBuildIdsJson());
        String build = buildIds.isEmpty() ? null : buildIds.get(0);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Long itemId : itemIds) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("deliveryItemId", itemId);
            row.put("buildId", build);
            rows.add(row);
        }
        return JsonUtils.toJson(rows);
    }

    /**
     * 构建标识必须属于当前批次的当前轮次（A.2）：有效集 = 批次 buildIds ∪ 冻结轮次 buildMapping 里的 buildId。
     * <p>客户端未传 → 默认批次首个构建；传了但不在有效集（且有效集非空）→ 拒绝。
     */
    private String resolveBuildId(RdmTestBatch batch, RdmTestRound round, String provided) {
        Set<String> valid = new LinkedHashSet<>(JsonUtils.parseStringList(batch.getBuildIdsJson()));
        for (Map<String, Object> row : JsonUtils.parseMapList(round == null ? null : round.getBuildMappingJson())) {
            String b = trimToNull(Objects.toString(row.get("buildId"), null));
            if (b != null) {
                valid.add(b);
            }
        }
        String p = trimToNull(provided);
        if (p == null) {
            return firstBuildId(batch);
        }
        if (!valid.isEmpty() && !valid.contains(p)) {
            throw new BusinessException("構建標識不屬於當前批次的當前輪次，拒絕錄入: buildId=" + p);
        }
        return p;
    }

    /** 测试环境必须属于当前轮次（A.2）：以冻结轮次环境为权威，客户端传值不一致即拒绝。 */
    private String resolveTestEnv(RdmTestBatch batch, RdmTestRound round, String provided) {
        String authoritative = (round != null && StringUtils.hasText(round.getTestEnv()))
                ? round.getTestEnv() : batch.getTestEnv();
        String p = trimToNull(provided);
        if (p == null) {
            return authoritative;
        }
        if (StringUtils.hasText(authoritative) && !authoritative.equals(p)) {
            throw new BusinessException("測試環境不屬於當前輪次，拒絕錄入：傳入=" + p + "，凍結=" + authoritative);
        }
        return p;
    }

    /** 取当前批次的当前冻结轮次（batchId + batch.roundNo），未冻结返回 null。 */
    private RdmTestRound currentFrozenRound(RdmTestBatch batch) {
        if (batch == null || batch.getId() == null) {
            return null;
        }
        Integer roundNo = batch.getRoundNo();
        return testRoundMapper.selectOne(new LambdaQueryWrapper<RdmTestRound>()
                .eq(RdmTestRound::getBatchId, batch.getId())
                .eq(roundNo != null, RdmTestRound::getRoundNo, roundNo)
                .orderByDesc(RdmTestRound::getId)
                .last("LIMIT 1"));
    }

    private RdmTestRound requireCurrentRound(RdmTestBatch batch) {
        RdmTestRound round = currentFrozenRound(batch);
        if (round == null) {
            throw new BusinessException("當前輪次尚未凍結，無法錄入執行結果（須先受理提測批次）: round=" + batch.getRoundNo());
        }
        return round;
    }

    /** 在冻结用例集中按 (deliveryItemId, caseId) 定位唯一用例，映射不到返回 null（供 fail-closed）。 */
    private Map<String, Object> findFrozenCase(RdmTestRound round, Long itemId, String caseId) {
        if (round == null || itemId == null || caseId == null) {
            return null;
        }
        for (Map<String, Object> c : JsonUtils.parseMapList(round.getCaseSnapshotJson())) {
            if (itemId.equals(toLong(Objects.toString(c.get("deliveryItemId"), null)))
                    && caseId.equals(Objects.toString(c.get("caseId"), null))) {
                return c;
            }
        }
        return null;
    }

    private List<Map<String, Object>> frozenCasesForItem(RdmTestRound round, Long itemId) {
        if (round == null || itemId == null) {
            return List.of();
        }
        return JsonUtils.parseMapList(round.getCaseSnapshotJson()).stream()
                .filter(c -> itemId.equals(toLong(Objects.toString(c.get("deliveryItemId"), null))))
                .toList();
    }

    /**
     * 单个冻结用例在本轮的有效结果（A.3/A.4）：
     * <ul>
     *   <li>同轮内任一 fail/blocked → fail（失败不被另一人 pass 掩盖，翻案走复测新轮）；</li>
     *   <li>含 skip → not_passed（skip ≠ 通过）；</li>
     *   <li>全部 pass（至少一条）→ pass；</li>
     *   <li>无执行记录 → not_executed（未执行 ≠ 通过）。</li>
     * </ul>
     */
    private String effectiveCaseResult(List<RdmTestExecution> caseExecs) {
        if (caseExecs.isEmpty()) {
            return EFFECTIVE_NOT_EXECUTED;
        }
        boolean anyBlocking = caseExecs.stream().anyMatch(e ->
                RESULT_FAIL.equals(e.getResult()) || RESULT_BLOCKED.equals(e.getResult()));
        if (anyBlocking) {
            return RESULT_FAIL;
        }
        boolean anySkip = caseExecs.stream().anyMatch(e -> RESULT_SKIP.equals(e.getResult()));
        if (anySkip) {
            return EFFECTIVE_NOT_PASSED;
        }
        boolean allPass = caseExecs.stream().allMatch(e -> RESULT_PASS.equals(e.getResult()));
        return allPass ? RESULT_PASS : EFFECTIVE_NOT_PASSED;
    }

    /**
     * 某冻结轮次内某交付项是否通过（A.5）：分母=冻结的唯一 caseId（mandatory 必测），全部 pass 才通过。
     * <p>无冻结用例 → false；任一必测用例的有效结果 ≠ pass → false。
     */
    private boolean isRoundPassedForItem(RdmTestRound round, Long itemId) {
        List<Map<String, Object>> cases = frozenCasesForItem(round, itemId);
        if (cases.isEmpty()) {
            return false;
        }
        List<RdmTestExecution> execs = executionMapper.selectList(new LambdaQueryWrapper<RdmTestExecution>()
                .eq(RdmTestExecution::getBatchId, round.getBatchId())
                .eq(RdmTestExecution::getDeliveryItemId, itemId)
                .eq(round.getRoundNo() != null, RdmTestExecution::getRoundNo, round.getRoundNo()));
        for (Map<String, Object> c : cases) {
            if (!toBool(c.get("mandatory"))) {
                continue; // 非必测不阻断（服务端规范化后默认全必测）
            }
            String caseId = Objects.toString(c.get("caseId"), null);
            List<RdmTestExecution> caseExecs = execs.stream()
                    .filter(e -> caseId != null && caseId.equals(e.getCaseId()))
                    .toList();
            if (!RESULT_PASS.equals(effectiveCaseResult(caseExecs))) {
                return false;
            }
        }
        return true;
    }

    /** 本轮次内某交付项是否存在阻断结果（fail/blocked），用于批次 failed 判定。 */
    private boolean hasBlockingInRound(RdmTestRound round, Long itemId) {
        if (round == null || itemId == null) {
            return false;
        }
        Long cnt = executionMapper.selectCount(new LambdaQueryWrapper<RdmTestExecution>()
                .eq(RdmTestExecution::getBatchId, round.getBatchId())
                .eq(RdmTestExecution::getDeliveryItemId, itemId)
                .eq(round.getRoundNo() != null, RdmTestExecution::getRoundNo, round.getRoundNo())
                .in(RdmTestExecution::getResult, RESULT_FAIL, RESULT_BLOCKED));
        return cnt != null && cnt > 0;
    }

    /** A.6 部分交付独立推进：某交付项测试通过后由 testing → pending_acceptance。 */
    private void advanceItemToPendingAcceptance(Long itemId) {
        RdmDeliveryItem item = deliveryItemMapper.selectById(itemId);
        if (item != null && RdmConstants.DI_TESTING.equals(item.getStatus())) {
            item.setStatus(RdmConstants.DI_PENDING_ACCEPTANCE);
            deliveryItemMapper.updateById(item);
        }
    }

    /**
     * A.8 失效过滤：范围变更后登记失效的提测批次不再有效。
     * <p>任务33：全量批次仍按本服务口径加载（delivery_item_ids_json 关联过滤），失效过滤委派共享 {@link EvidenceValidityResolver}。
     */
    private List<RdmTestBatch> loadValidTestBatchesForItem(Long itemId) {
        return evidenceValidityResolver.validTestBatches(itemId, loadTestBatchesForItem(itemId));
    }

    /** 复刻任务19 {@code loadTestBatchesForItem}：test_batch 通过 delivery_item_ids_json 关联，全查后按数组包含过滤。 */
    private List<RdmTestBatch> loadTestBatchesForItem(Long itemId) {
        if (itemId == null) {
            return List.of();
        }
        return batchMapper.selectList(new LambdaQueryWrapper<RdmTestBatch>()
                        .like(RdmTestBatch::getDeliveryItemIdsJson, String.valueOf(itemId)))
                .stream()
                .filter(b -> itemIdsOf(b).contains(itemId))
                .toList();
    }

    private static Long toLong(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer toInt(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.valueOf(value.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** mandatory 缺省视为必测（服务端权威、保守）：null → true。 */
    private static boolean toBool(Object value) {
        if (value == null) {
            return true;
        }
        if (value instanceof Boolean b) {
            return b;
        }
        return Boolean.parseBoolean(value.toString().trim());
    }

    /** 冻结范围快照：交付项 id/编号/标题/范围版本/验收路径，作为本批次不可变的事实基线。 */
    private List<Map<String, Object>> buildScopeSnapshot(List<RdmDeliveryItem> items) {
        List<Map<String, Object>> snapshot = new ArrayList<>();
        for (RdmDeliveryItem item : items) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("deliveryItemId", item.getId());
            row.put("itemNo", item.getItemNo());
            row.put("title", item.getTitle());
            row.put("scopeVersion", item.getScopeVersion());
            row.put("acceptancePath", item.getAcceptancePath());
            snapshot.add(row);
        }
        return snapshot;
    }

    /** 统计当前轮次的 [pass, fail+blocked, total]。 */
    private int[] countCurrentRound(List<RdmTestExecution> execs, Integer round) {
        int pass = 0, fail = 0, total = 0;
        for (RdmTestExecution e : execs) {
            if (round != null && e.getRoundNo() != null && !round.equals(e.getRoundNo())) {
                continue;
            }
            total++;
            if (RESULT_PASS.equals(e.getResult())) {
                pass++;
            } else if (RESULT_FAIL.equals(e.getResult()) || RESULT_BLOCKED.equals(e.getResult())) {
                fail++;
            }
        }
        return new int[]{pass, fail, total};
    }

    private Map<Long, List<RdmTestExecution>> loadExecutionsByBatch(List<Long> batchIds) {
        if (batchIds == null || batchIds.isEmpty()) {
            return Map.of();
        }
        List<RdmTestExecution> execs = executionMapper.selectList(new LambdaQueryWrapper<RdmTestExecution>()
                .in(RdmTestExecution::getBatchId, batchIds));
        return execs.stream().collect(Collectors.groupingBy(RdmTestExecution::getBatchId));
    }

    private Map<Long, String> loadReqTitles(List<Long> reqIds) {
        return loadReqField(reqIds, RdmRequirement::getTitle);
    }

    private Map<Long, String> loadReqNos(List<Long> reqIds) {
        return loadReqField(reqIds, RdmRequirement::getReqNo);
    }

    private Map<Long, String> loadReqField(List<Long> reqIds,
                                           java.util.function.Function<RdmRequirement, String> getter) {
        List<Long> ids = reqIds == null ? List.of()
                : reqIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                        .in(RdmRequirement::getId, ids)).stream()
                .collect(Collectors.toMap(RdmRequirement::getId, r -> {
                    String v = getter.apply(r);
                    return v == null ? "" : v;
                }, (a, b) -> a));
    }

    private Map<Long, String> loadItemTitles(List<Long> itemIds) {
        List<Long> ids = itemIds == null ? List.of()
                : itemIds.stream().filter(Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        return deliveryItemMapper.selectList(new LambdaQueryWrapper<RdmDeliveryItem>()
                        .in(RdmDeliveryItem::getId, ids)).stream()
                .collect(Collectors.toMap(RdmDeliveryItem::getId,
                        i -> i.getTitle() == null ? "" : i.getTitle(), (a, b) -> a));
    }

    private List<Long> itemIdsOf(RdmTestBatch batch) {
        return JsonUtils.parseLongList(batch.getDeliveryItemIdsJson());
    }

    private String firstBuildId(RdmTestBatch batch) {
        List<String> buildIds = JsonUtils.parseStringList(batch.getBuildIdsJson());
        return buildIds.isEmpty() ? null : buildIds.get(0);
    }

    private RdmTestBatch requireBatch(Long batchId) {
        RdmTestBatch batch = batchId == null ? null : batchMapper.selectById(batchId);
        if (batch == null) {
            throw new BusinessException("提測批次不存在或已刪除");
        }
        return batch;
    }

    /** 测试负责人校验（管理员放行）：只有本批次指定负责人能接收/退回/复测。 */
    private void requireTestLead(RdmTestBatch batch, Long currentUserId, String action) {
        if (canSeeAll()) {
            return;
        }
        if (currentUserId == null || !currentUserId.equals(batch.getTestLeadUserId())) {
            throw new BusinessException("僅本批次的測試負責人可以" + action);
        }
    }

    /** 执行人校验（管理员/测试负责人放行）：录入结果必须是批次登记的执行人之一。 */
    private void requireExecutor(RdmTestBatch batch, Long currentUserId, String action) {
        if (canSeeAll()) {
            return;
        }
        if (currentUserId != null && currentUserId.equals(batch.getTestLeadUserId())) {
            return;
        }
        List<Long> executors = JsonUtils.parseLongList(batch.getExecutorUserIdsJson());
        if (currentUserId == null || !executors.contains(currentUserId)) {
            throw new BusinessException("您不是本批次的測試執行人，無法" + action);
        }
    }

    /** 仅 flow_version=3 的新链路可用本服务。 */
    private void requireFlowV3(Long reqId) {
        RdmRequirement req = requirementMapper.selectById(reqId);
        if (req == null) {
            throw new BusinessException("關聯需求不存在或已刪除");
        }
        if (req.getFlowVersion() == null || req.getFlowVersion() != RdmConstants.FLOW_VERSION_3) {
            throw new BusinessException("該需求非新版交付流程（flow_version=3），無法使用提測批次");
        }
    }

    private boolean canSeeAll() {
        SysUser current = operatorResolver.currentUser();
        return accessGuard.canSeeAll(current);
    }

    private String generateBatchNo() {
        return bizSeqService.next(SEQ_TEST_BATCH);
    }

    private RdmTestBatchVO.ListItem toListItem(RdmTestBatch b, List<RdmTestExecution> execs,
                                               Map<Long, String> reqTitleMap, Map<Long, String> reqNoMap) {
        RdmTestBatchVO.ListItem vo = new RdmTestBatchVO.ListItem();
        vo.setId(b.getId());
        vo.setBatchNo(b.getBatchNo());
        vo.setReqId(b.getReqId());
        vo.setReqTitle(b.getReqId() == null ? null : reqTitleMap.get(b.getReqId()));
        vo.setReqNo(b.getReqId() == null ? null : reqNoMap.get(b.getReqId()));
        Map<Long, String> itemTitleMap = loadItemTitles(itemIdsOf(b));
        vo.setDeliveryItemTitles(itemIdsOf(b).stream()
                .map(id -> itemTitleMap.getOrDefault(id, "")).filter(StringUtils::hasText).toList());
        vo.setTestEnv(b.getTestEnv());
        vo.setTestLeadUserName(b.getTestLeadUserName());
        vo.setStatus(b.getStatus());
        vo.setRoundNo(b.getRoundNo());
        vo.setPlanEndTime(DateTimeUtils.format(b.getPlanEndTime()));
        int[] counts = countCurrentRound(execs, b.getRoundNo());
        vo.setPassCount(counts[0]);
        vo.setFailCount(counts[1]);
        vo.setTotalCount(counts[2]);
        vo.setCreatedAt(DateTimeUtils.format(b.getCreatedAt()));
        return vo;
    }

    private RdmTestBatchVO.ExecutionRecord toExecutionRecord(RdmTestExecution e, Map<Long, String> itemTitleMap) {
        RdmTestBatchVO.ExecutionRecord vo = new RdmTestBatchVO.ExecutionRecord();
        vo.setId(e.getId());
        vo.setDeliveryItemId(e.getDeliveryItemId());
        vo.setDeliveryItemTitle(e.getDeliveryItemId() == null ? null
                : itemTitleMap.getOrDefault(e.getDeliveryItemId(), null));
        vo.setCaseTitle(e.getCaseTitle());
        vo.setExecutorUserName(e.getExecutorUserName());
        vo.setBuildId(e.getBuildId());
        vo.setTestEnv(e.getTestEnv());
        vo.setResult(e.getResult());
        vo.setExecutedAt(DateTimeUtils.format(e.getExecutedAt()));
        vo.setRemark(e.getRemark());
        vo.setRoundNo(e.getRoundNo());
        // Batch 3 门禁映射事实（供任务23 展示执行记录与冻结用例对齐）
        vo.setCaseId(e.getCaseId());
        vo.setTestRoundId(e.getTestRoundId());
        vo.setScopeVersion(e.getScopeVersion());
        vo.setEvidenceJson(e.getEvidenceJson());
        return vo;
    }

    private static LocalDateTime parseDateTime(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            String cleaned = value.trim().replace(' ', 'T');
            if (cleaned.length() == 16) {
                cleaned = cleaned + ":00";
            }
            if (cleaned.length() > 19) {
                cleaned = cleaned.substring(0, 19);
            }
            return LocalDateTime.parse(cleaned);
        } catch (Exception e) {
            throw new BusinessException("時間格式不正確：" + value + "（應為 YYYY-MM-DD HH:mm:ss）");
        }
    }

    private static long normalizePage(Integer pageNo) {
        return pageNo == null || pageNo < 1 ? 1L : pageNo;
    }

    private static long normalizeSize(Integer pageSize) {
        if (pageSize == null || pageSize < 1) {
            return 20L;
        }
        return Math.min(pageSize, 200L);
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }
}
