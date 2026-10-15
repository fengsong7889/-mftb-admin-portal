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
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
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
}
