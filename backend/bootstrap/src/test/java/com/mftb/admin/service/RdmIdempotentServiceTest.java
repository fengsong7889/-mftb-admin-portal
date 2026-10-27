package com.mftb.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmIdempotentLog;
import com.mftb.admin.mapper.RdmIdempotentLogMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@link RdmIdempotentService#executeOnce} 原子幂等行为的纯 mock 单测（Batch 3 / rdm:schema:v3.2）。
 *
 * <p><b>重要边界声明</b>：本测试用 mock 的 {@link PlatformTransactionManager} 与 {@link RdmIdempotentLogMapper}
 * 驱动 {@code TransactionTemplate} 回调，只验证「服务层编排逻辑」正确——即占位/回放/冲突/拒绝/回滚的分支走向。
 * 它<b>不等价于真实数据库并发证明</b>：真正的「并发只一个成功」依赖 MySQL 唯一索引 {@code uk_request_id}
 * 在第二个事务 INSERT 时阻塞、待第一个提交后抛 {@link DuplicateKeyException}，这一物理串行化无法由 mock 复现，
 * 需在集成/并发测试中以真实库验证。此处以「insert 抛 DuplicateKeyException」模拟并发败者路径。
 *
 * <p>覆盖 6 个契约场景：首次执行、相同请求回放、不同内容冲突、跨用户拒绝、
 * 并发唯一约束回落回放、业务异常回滚不吞。
 */
class RdmIdempotentServiceTest {

    private static final String HASH_A = RdmIdempotentService.sha256Hex("payload-A");
    private static final String HASH_B = RdmIdempotentService.sha256Hex("payload-B");
    private static final String CACHED = "APPLIED";

    private RdmIdempotentLogMapper mapper;
    private PlatformTransactionManager txManager;
    private ObjectMapper objectMapper;
    private RdmIdempotentService service;

    @BeforeEach
    void setUp() {
        mapper = mock(RdmIdempotentLogMapper.class);
        txManager = mock(PlatformTransactionManager.class);
        objectMapper = new ObjectMapper();
        service = new RdmIdempotentService(mapper, objectMapper, txManager);
    }

    private IdempotentKey key(long userId, String requestHash) {
        return IdempotentKey.builder()
                .userId(userId)
                .bizType("release_apply")
                .resourceKey("release_batch:123")
                .clientRequestId("client-req-0001")
                .requestHash(requestHash)
                .build();
    }

    private RdmIdempotentLog completedRow(IdempotentKey k, Long rowUserId, String rowHash) throws Exception {
        RdmIdempotentLog row = new RdmIdempotentLog();
        row.setId(99L);
        row.setRequestId(RdmIdempotentService.bindingRequestId(k));
        row.setBizType(k.getBizType());
        row.setUserId(rowUserId);
        row.setResourceKey(k.getResourceKey());
        row.setClientRequestId(k.getClientRequestId());
        row.setRequestHash(rowHash);
        row.setStatus(RdmConstants.IDEMPOTENT_STATUS_COMPLETED);
        row.setResultJson(objectMapper.writeValueAsString(CACHED));
        return row;
    }

    /* ==================== 场景 1：首次执行 ==================== */

    @Test
    @DisplayName("首次执行：占位(processing)→业务→写回(completed) 同一事务，业务只跑一次")
    void firstExecutionRunsBusinessOnceAndPersistsCompleted() {
        IdempotentKey k = key(1L, HASH_A);
        when(mapper.selectOne(any())).thenReturn(null); // 预检未命中
        AtomicInteger runs = new AtomicInteger();

        String result = service.executeOnce(k, () -> {
            runs.incrementAndGet();
            return CACHED;
        }, String.class);

        assertEquals(CACHED, result);
        assertEquals(1, runs.get(), "首次执行业务动作应恰好运行一次");

        // 占位行：status=processing，request_id 为绑定派生哈希，绑定列齐全
        ArgumentCaptor<RdmIdempotentLog> ins = ArgumentCaptor.forClass(RdmIdempotentLog.class);
        verify(mapper, times(1)).insert(ins.capture());
        RdmIdempotentLog placeholder = ins.getValue();
        assertEquals(RdmConstants.IDEMPOTENT_STATUS_PROCESSING, placeholder.getStatus());
        assertEquals(RdmIdempotentService.bindingRequestId(k), placeholder.getRequestId());
        assertEquals(Long.valueOf(1L), placeholder.getUserId());
        assertEquals(k.getResourceKey(), placeholder.getResourceKey());
        assertEquals(k.getClientRequestId(), placeholder.getClientRequestId());
        assertEquals(HASH_A, placeholder.getRequestHash());

        // 结果写回：status=completed 且带 result_json
        ArgumentCaptor<RdmIdempotentLog> upd = ArgumentCaptor.forClass(RdmIdempotentLog.class);
        verify(mapper, times(1)).updateById(upd.capture());
        assertEquals(RdmConstants.IDEMPOTENT_STATUS_COMPLETED, upd.getValue().getStatus());
        assertTrue(upd.getValue().getResultJson() != null && !upd.getValue().getResultJson().isBlank());
        // 首次成功路径不应回滚
        verify(txManager, never()).rollback(any());
    }

    /* ==================== 场景 2：相同请求回放 ==================== */

    @Test
    @DisplayName("相同请求回放：已 completed 且同 user 同 hash → 返回首次结果，不执行业务、不再写库")
    void replayReturnsCachedResultWithoutRunningBusiness() {
        IdempotentKey k = key(1L, HASH_A);
        RdmIdempotentLog row;
        try {
            row = completedRow(k, 1L, HASH_A);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        when(mapper.selectOne(any())).thenReturn(row);
        AtomicInteger runs = new AtomicInteger();

        String result = service.executeOnce(k, () -> {
            runs.incrementAndGet();
            return "FRESH-SHOULD-NOT-RUN";
        }, String.class);

        assertEquals(CACHED, result, "应回放首次缓存结果");
        assertEquals(0, runs.get(), "回放时绝不能再次执行业务动作");
        verify(mapper, never()).insert(any(RdmIdempotentLog.class));
        verify(mapper, never()).updateById(any(RdmIdempotentLog.class));
    }

    /* ==================== 场景 3：不同内容冲突 ==================== */

    @Test
    @DisplayName("同键不同内容：requestHash 不一致 → 抛 CONFLICT，不回放、不执行业务")
    void conflictWhenSameKeyDifferentRequestHash() {
        IdempotentKey k = key(1L, HASH_A);
        RdmIdempotentLog row;
        try {
            row = completedRow(k, 1L, HASH_B); // 存储的 hash 与当前请求不同
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        when(mapper.selectOne(any())).thenReturn(row);
        AtomicInteger runs = new AtomicInteger();

        BusinessException ex = assertThrows(BusinessException.class, () -> service.executeOnce(k, () -> {
            runs.incrementAndGet();
            return CACHED;
        }, String.class));

        assertEquals(ResultCode.CONFLICT.getCode(), ex.getCode());
        assertEquals(0, runs.get(), "内容冲突时不得执行业务");
        verify(mapper, never()).insert(any(RdmIdempotentLog.class));
        verify(mapper, never()).updateById(any(RdmIdempotentLog.class));
    }

    /* ==================== 场景 4：跨用户拒绝 ==================== */

    @Test
    @DisplayName("跨用户回放：命中行 user_id 与当前认证用户不同 → 抛 FORBIDDEN（先于内容校验）")
    void forbiddenWhenCrossUserReplay() {
        IdempotentKey k = key(1L, HASH_A);
        RdmIdempotentLog row;
        try {
            row = completedRow(k, 2L, HASH_A); // 行归属另一用户
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        when(mapper.selectOne(any())).thenReturn(row);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.executeOnce(k, () -> CACHED, String.class));

        assertEquals(ResultCode.FORBIDDEN.getCode(), ex.getCode());
        verify(mapper, never()).insert(any(RdmIdempotentLog.class));
        verify(mapper, never()).updateById(any(RdmIdempotentLog.class));
    }

    /* ==================== 场景 5：并发唯一约束回落回放 ==================== */

    @Test
    @DisplayName("并发败者：占位 INSERT 撞唯一键 → 回滚本事务，只读事务重查胜者并回放，绝不双执行")
    void concurrentDuplicateFallsBackToWinnerReplay() {
        IdempotentKey k = key(1L, HASH_A);
        RdmIdempotentLog winner;
        try {
            winner = completedRow(k, 1L, HASH_A);
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        // 预检未命中（胜者尚未提交）→ 占位冲突后重查命中胜者
        when(mapper.selectOne(any())).thenReturn(null, winner);
        when(mapper.insert(any(RdmIdempotentLog.class))).thenThrow(new DuplicateKeyException("uk_request_id"));
        AtomicInteger runs = new AtomicInteger();

        String result = service.executeOnce(k, () -> {
            runs.incrementAndGet();
            return "FRESH-SHOULD-NOT-RUN";
        }, String.class);

        assertEquals(CACHED, result, "并发败者应回放胜者已提交结果");
        assertEquals(0, runs.get(), "并发败者绝不能执行业务动作（避免双副作用）");
        verify(mapper, never()).updateById(any(RdmIdempotentLog.class));
        // 败者事务因占位冲突回滚
        verify(txManager, atLeastOnce()).rollback(any());
    }

    /* ==================== 场景 6：业务异常回滚不吞 ==================== */

    @Test
    @DisplayName("业务异常：原样向上传播触发事务回滚，不写回 completed、不吞异常")
    void businessExceptionPropagatesAndRollsBack() {
        IdempotentKey k = key(1L, HASH_A);
        when(mapper.selectOne(any())).thenReturn(null);
        when(mapper.insert(any(RdmIdempotentLog.class))).thenReturn(1);
        IllegalStateException boom = new IllegalStateException("业务校验失败");
        AtomicInteger runs = new AtomicInteger();

        IllegalStateException thrown = assertThrows(IllegalStateException.class,
                () -> service.executeOnce(k, () -> {
                    runs.incrementAndGet();
                    throw boom;
                }, String.class));

        assertSame(boom, thrown, "业务异常必须原样传播，不得被吞或包装");
        assertEquals(1, runs.get(), "业务动作确实被执行过");
        verify(mapper, times(1)).insert(any(RdmIdempotentLog.class));
        verify(mapper, never()).updateById(any(RdmIdempotentLog.class)); // 未写回 completed（占位随事务回滚）
        verify(txManager, atLeastOnce()).rollback(any()); // 事务回滚
    }

    /* ==================== 契约补充：占位键派生与稳定哈希 ==================== */

    @Test
    @DisplayName("占位键只由 userId|bizType|resourceKey|clientRequestId 派生，与 requestHash 无关，且为 64 位 hex")
    void bindingRequestIdIgnoresRequestHashAndIsStable() {
        IdempotentKey k1 = key(1L, HASH_A);
        IdempotentKey sameBindingDiffHash = key(1L, HASH_B);
        assertEquals(RdmIdempotentService.bindingRequestId(k1),
                RdmIdempotentService.bindingRequestId(sameBindingDiffHash),
                "内容 hash 不同但绑定四要素相同 → 占位键必须相同");
        assertEquals(64, RdmIdempotentService.bindingRequestId(k1).length());

        IdempotentKey diffClientReq = IdempotentKey.builder()
                .userId(1L).bizType("release_apply").resourceKey("release_batch:123")
                .clientRequestId("client-req-DIFFERENT").requestHash(HASH_A).build();
        assertNotEquals(RdmIdempotentService.bindingRequestId(k1),
                RdmIdempotentService.bindingRequestId(diffClientReq),
                "clientRequestId 不同 → 占位键必须不同");
    }

    @Test
    @DisplayName("稳定哈希：字段/键顺序不同但内容相同 → 同一 requestHash；内容不同 → 不同 hash")
    void stableRequestHashIsOrderInsensitive() {
        Map<String, Object> m1 = new LinkedHashMap<>();
        m1.put("action", "apply");
        m1.put("version", 3);
        Map<String, Object> m2 = new LinkedHashMap<>();
        m2.put("version", 3);
        m2.put("action", "apply");
        assertEquals(service.stableRequestHash(m1), service.stableRequestHash(m2),
                "书写顺序不同但内容相同的请求体必须得到同一稳定哈希");

        Map<String, Object> m3 = new LinkedHashMap<>();
        m3.put("action", "apply");
        m3.put("version", 4);
        assertNotEquals(service.stableRequestHash(m1), service.stableRequestHash(m3),
                "内容不同的请求体必须得到不同哈希，供冲突判定");
    }

    @Test
    @DisplayName("IdempotentKey 构造强校验：缺少认证用户直接拒绝，避免半初始化键进入事务")
    void idempotentKeyRejectsMissingUser() {
        BusinessException ex = assertThrows(BusinessException.class, () -> IdempotentKey.builder()
                .bizType("release_apply").resourceKey("release_batch:123")
                .clientRequestId("c1").requestHash(HASH_A).build());
        assertEquals(ResultCode.PARAM_ERROR.getCode(), ex.getCode());
    }

    /* ==================== 任务28：client_request_id 列宽归一化（VARCHAR(64) CHARACTER SET ascii） ==================== */

    /** 生产真实超宽场景：{@code op + ":" + 64位hex判别子} = 75 字符（如 {@code applyDefer:<hash>}）。 */
    private static final String OVERLONG_LOGICAL = "applyDefer:" + HASH_A;
    /** 含非 ASCII（中文）但长度远小于 64 的逻辑值。 */
    private static final String NON_ASCII_LOGICAL = "延期申請:abc";

    /** 断言字符串可安全写入 {@code client_request_id VARCHAR(64) ascii}：长度 ≤64 且全为可打印 ASCII(0x20..0x7E)。 */
    private static void assertFitsClientRequestIdColumn(String value, String hint) {
        assertNotNull(value, hint + "：归一化结果不可为 null");
        assertTrue(value.length() <= 64, hint + "：长度须 ≤64，实际 " + value.length() + " → " + value);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            assertTrue(c >= 0x20 && c <= 0x7E,
                    hint + "：第 " + i + " 位 0x" + Integer.toHexString(c) + " 超出可打印 ASCII(0x20..0x7E)");
        }
    }

    private static void assertLowerHex64(String value, String hint) {
        assertFitsClientRequestIdColumn(value, hint);
        assertTrue(value.matches("[0-9a-f]{64}"), hint + "：须为 64 位小写 hex，实际 → " + value);
    }

    /** 以指定逻辑 clientRequestId 构造绑定键（其余四要素固定），用于验证中心归一化与占位键派生。 */
    private static IdempotentKey keyWithClientRequestId(String clientRequestId) {
        return IdempotentKey.builder()
                .userId(1L)
                .bizType("issue_defer")
                .resourceKey("issue:1001")
                .clientRequestId(clientRequestId)
                .requestHash(HASH_A)
                .build();
    }

    /** 走首次执行路径并捕获实际写入的占位实体（即真实落库到 client_request_id 列的值）。 */
    private RdmIdempotentLog capturePersistedPlaceholder(IdempotentKey k) {
        clearInvocations(mapper); // 支持同一用例内多次捕获（保留桩，只清调用记录）
        when(mapper.selectOne(any())).thenReturn(null); // 预检未命中 → 首次执行
        service.executeOnce(k, () -> CACHED, String.class);
        ArgumentCaptor<RdmIdempotentLog> ins = ArgumentCaptor.forClass(RdmIdempotentLog.class);
        verify(mapper, times(1)).insert(ins.capture());
        return ins.getValue();
    }

    @Test
    @DisplayName("归一化：≤64 纯 ASCII 原样不变（含 64 位边界、空格与 ~ 边界、空串）")
    void normalizeKeepsShortPrintableAsciiUnchanged() {
        assertEquals("client-req-0001", RdmIdempotentService.normalizeClientRequestId("client-req-0001"));
        assertEquals("", RdmIdempotentService.normalizeClientRequestId(""));
        // 可打印 ASCII 边界字符（空格 0x20 与 ~ 0x7E）不得被改写
        String boundary = "a b~!@#$%^&*()_+-=[]{};':\",./<>?";
        assertEquals(boundary, RdmIdempotentService.normalizeClientRequestId(boundary));
        // 恰好 64 字符：等于列宽上限，仍原样保留
        String exactly64 = "a".repeat(64);
        assertEquals(exactly64.length(), 64);
        assertEquals(exactly64, RdmIdempotentService.normalizeClientRequestId(exactly64));
        // 已是 64 位 hex 的归一化产物必须是不动点（保证幂等）
        assertEquals(HASH_A, RdmIdempotentService.normalizeClientRequestId(HASH_A));
    }

    @Test
    @DisplayName("归一化：长度 >64 → 该逻辑值的 SHA-256（64 位小写 hex，确定性可复算）")
    void normalizeHashesOverlongValue() {
        assertEquals(75, OVERLONG_LOGICAL.length(), "前置条件：op+\":\"+64hex 确为 75 字符超宽值");
        String normalized = RdmIdempotentService.normalizeClientRequestId(OVERLONG_LOGICAL);
        assertLowerHex64(normalized, "超宽值归一化");
        assertEquals(RdmIdempotentService.sha256Hex(OVERLONG_LOGICAL), normalized, "须为该逻辑值的 SHA-256");

        // 65 字符（刚过界）与 200 字符（远超界）同样收敛为 64 hex
        assertLowerHex64(RdmIdempotentService.normalizeClientRequestId("b".repeat(65)), "65 字符");
        assertLowerHex64(RdmIdempotentService.normalizeClientRequestId("c".repeat(200)), "200 字符");
        // 不同超宽输入不得撞成同一值（确定性 + 区分度）
        assertNotEquals(RdmIdempotentService.normalizeClientRequestId("b".repeat(65)),
                RdmIdempotentService.normalizeClientRequestId("c".repeat(65)));
    }

    @Test
    @DisplayName("归一化：含非可打印 ASCII（中文/emoji/控制字符/DEL）→ 64 位小写 hex")
    void normalizeHashesNonAsciiAndControlChars() {
        assertLowerHex64(RdmIdempotentService.normalizeClientRequestId(NON_ASCII_LOGICAL), "中文");
        assertEquals(RdmIdempotentService.sha256Hex(NON_ASCII_LOGICAL),
                RdmIdempotentService.normalizeClientRequestId(NON_ASCII_LOGICAL));

        // emoji（代理对）、控制字符 0x01/0x1F、DEL 0x7F 均落在 0x20..0x7E 之外
        assertLowerHex64(RdmIdempotentService.normalizeClientRequestId("req-\uD83D\uDE80"), "emoji");
        assertLowerHex64(RdmIdempotentService.normalizeClientRequestId("req-\u0001"), "控制字符 0x01");
        assertLowerHex64(RdmIdempotentService.normalizeClientRequestId("req-\u001F"), "控制字符 0x1F");
        assertLowerHex64(RdmIdempotentService.normalizeClientRequestId("req-\u007F"), "DEL 0x7F");
        // 换行/制表符（<0x20）同样必须被收敛，避免脏值写入 ascii 列
        assertLowerHex64(RdmIdempotentService.normalizeClientRequestId("req-\n\t"), "换行制表");
    }

    @Test
    @DisplayName("归一化幂等：normalize(normalize(x)) == normalize(x)，且任意输入结果都适配列宽")
    void normalizeIsIdempotent() {
        String[] inputs = {
                "client-req-0001", "", "a".repeat(64), "b".repeat(65), "c".repeat(300),
                OVERLONG_LOGICAL, NON_ASCII_LOGICAL, "延期-\uD83D\uDE80", "biz:\u0000\u007F", HASH_A
        };
        for (String input : inputs) {
            String once = RdmIdempotentService.normalizeClientRequestId(input);
            String twice = RdmIdempotentService.normalizeClientRequestId(once);
            assertFitsClientRequestIdColumn(once, "输入长度 " + input.length());
            assertEquals(once, twice, "归一化必须幂等（不动点），输入长度 " + input.length());
        }
    }

    @Test
    @DisplayName("归一化：null 原样返回（旧 V1/V2 路径不回填该列，不得抛 NPE）")
    void normalizePassesThroughNull() {
        assertNull(RdmIdempotentService.normalizeClientRequestId(null));
    }

    @Test
    @DisplayName("executeOnce 落库：逻辑 clientRequestId 超宽/非 ASCII 时，实际写入列 ≤64 且全为可打印 ASCII")
    void executeOncePersistsColumnSafeClientRequestId() {
        // 1) 超宽（75 字符）：落库为 64 hex
        RdmIdempotentLog overlongRow = capturePersistedPlaceholder(keyWithClientRequestId(OVERLONG_LOGICAL));
        assertFitsClientRequestIdColumn(overlongRow.getClientRequestId(), "超宽落库");
        assertEquals(RdmIdempotentService.sha256Hex(OVERLONG_LOGICAL), overlongRow.getClientRequestId(),
                "落库值须为逻辑值的 SHA-256（中心 choke point 唯一兜底）");

        // 2) 非 ASCII（中文 + emoji，长度 ≤64）：同样收敛为 64 hex
        String nonAscii = "延期申請-\uD83D\uDE80";
        assertTrue(nonAscii.length() <= 64, "前置条件：仅因字符集不适配而非超宽");
        RdmIdempotentLog nonAsciiRow = capturePersistedPlaceholder(keyWithClientRequestId(nonAscii));
        assertLowerHex64(nonAsciiRow.getClientRequestId(), "非 ASCII 落库");
        assertEquals(RdmIdempotentService.sha256Hex(nonAscii), nonAsciiRow.getClientRequestId());
    }

    @Test
    @DisplayName("executeOnce 落库：≤64 纯 ASCII 的逻辑值原样落库，不被无谓哈希")
    void executeOnceKeepsShortAsciiClientRequestIdAsIs() {
        RdmIdempotentLog row = capturePersistedPlaceholder(keyWithClientRequestId("client-req-0001"));
        assertEquals("client-req-0001", row.getClientRequestId());
        assertFitsClientRequestIdColumn(row.getClientRequestId(), "短 ASCII 落库");
    }

    @Test
    @DisplayName("存储列归一化不改变绑定语义：request_id 仍由「逻辑」clientRequestId 派生且稳定为 64 hex")
    void normalizationDoesNotChangeBindingRequestIdSemantics() {
        IdempotentKey overlongKey = keyWithClientRequestId(OVERLONG_LOGICAL);
        String expectedFromLogical = RdmIdempotentService.sha256Hex(
                overlongKey.getUserId() + "|" + overlongKey.getBizType() + "|"
                        + overlongKey.getResourceKey() + "|" + OVERLONG_LOGICAL);

        // 1) bindingRequestId 基于逻辑值：与手工复算一致
        assertEquals(expectedFromLogical, RdmIdempotentService.bindingRequestId(overlongKey));
        // 2) 绝不基于归一化后的存储值（否则语义被偷换）
        String normalizedStorage = RdmIdempotentService.normalizeClientRequestId(OVERLONG_LOGICAL);
        String wouldBeFromNormalized = RdmIdempotentService.sha256Hex(
                overlongKey.getUserId() + "|" + overlongKey.getBizType() + "|"
                        + overlongKey.getResourceKey() + "|" + normalizedStorage);
        assertNotEquals(wouldBeFromNormalized, RdmIdempotentService.bindingRequestId(overlongKey),
                "占位键输入语义必须是逻辑 clientRequestId，而非归一化后的存储副本");
        // 3) 同一逻辑键重复派生结果稳定（幂等重试仍可命中同一占位行）
        assertEquals(RdmIdempotentService.bindingRequestId(overlongKey),
                RdmIdempotentService.bindingRequestId(keyWithClientRequestId(OVERLONG_LOGICAL)));
        assertLowerHex64(RdmIdempotentService.bindingRequestId(overlongKey), "占位键");

        // 4) 实际落库的占位行：request_id 取自逻辑派生，client_request_id 取归一化副本，二者互不污染
        RdmIdempotentLog row = capturePersistedPlaceholder(overlongKey);
        assertEquals(RdmIdempotentService.bindingRequestId(overlongKey), row.getRequestId());
        assertEquals(normalizedStorage, row.getClientRequestId());
        assertNotEquals(row.getRequestId(), row.getClientRequestId());
    }
}
