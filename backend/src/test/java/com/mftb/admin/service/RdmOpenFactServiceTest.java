package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.conditions.ISqlSegment;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmReleaseAttempt;
import com.mftb.admin.entity.RdmReleaseBatch;
import com.mftb.admin.entity.RdmReleaseDeployment;
import com.mftb.admin.mapper.RdmReleaseAttemptMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmReleaseDeploymentMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * 任务27「開放事實」只讀判定纯 Mockito 离线单测。
 *
 * <p>锁死口径：開放是<b>独立事实</b>，只能由 {@code open_status=opened} 投影 <b>+</b>
 * {@code action=open/result=opened} 追加事实共同成立，且<b>不得被更晚的 rollback 事实掩盖</b>。
 * 这正是路径B（先上线后业务验收）{@code post_release} 业务验收的唯一门禁依据，
 * 任何一处放宽都会让「上线后验收」退化成纸面流程。
 *
 * <p><b>边界声明</b>：本测试以 mock Mapper 驱动只读判定逻辑，只验证「分支走向与事实口径」，
 * 不等价于真实数据库查询证明（{@code LIKE} 预筛的真实行为须在任务24 集成测试验证）。
 */
class RdmOpenFactServiceTest {

    private static final long ITEM_ID = 500L;
    private static final long ITEM_ID_LOOKALIKE = 5001L;
    private static final long BATCH_ID = 900L;
    private static final long DEPLOYMENT_ID = 800L;

    private RdmReleaseBatchMapper batchMapper;
    private RdmReleaseDeploymentMapper deploymentMapper;
    private RdmReleaseAttemptMapper attemptMapper;
    private RdmOpenFactService service;

    @BeforeEach
    void setUp() {
        batchMapper = mock(RdmReleaseBatchMapper.class);
        deploymentMapper = mock(RdmReleaseDeploymentMapper.class);
        attemptMapper = mock(RdmReleaseAttemptMapper.class);
        doReturn(new ArrayList<>()).when(batchMapper).selectList(any());
        doReturn(new ArrayList<>()).when(deploymentMapper).selectList(any());
        doReturn(new ArrayList<>()).when(attemptMapper).selectList(any());
        service = new RdmOpenFactService(batchMapper, deploymentMapper, attemptMapper);
    }

    /* ==================== 夹具 ==================== */

    private static RdmReleaseBatch batch(String status, String scopeSnapshotJson) {
        RdmReleaseBatch b = new RdmReleaseBatch();
        b.setId(BATCH_ID);
        b.setBatchNo("RB20261015001");
        b.setStatus(status);
        b.setScopeSnapshotJson(scopeSnapshotJson);
        return b;
    }

    private static String scope(long... itemIds) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < itemIds.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append("{\"deliveryItemId\":").append(itemIds[i])
                    .append(",\"scopeVersion\":4,\"title\":\"item-").append(itemIds[i]).append("\"}");
        }
        return sb.append(']').toString();
    }

    private static RdmReleaseDeployment deployment(String openStatus) {
        RdmReleaseDeployment d = new RdmReleaseDeployment();
        d.setId(DEPLOYMENT_ID);
        d.setReleaseBatchId(BATCH_ID);
        d.setSystemCode("SYS_A");
        d.setDeployStatus(RdmConstants.DEPLOY_SUCCESS);
        d.setVerifyStatus(RdmConstants.VERIFY_PASSED);
        d.setOpenStatus(openStatus);
        return d;
    }

    private static RdmReleaseAttempt attempt(long id, String action, String result, LocalDateTime occurredAt) {
        RdmReleaseAttempt a = new RdmReleaseAttempt();
        a.setId(id);
        a.setReleaseBatchId(BATCH_ID);
        a.setDeploymentId(DEPLOYMENT_ID);
        a.setAction(action);
        a.setResult(result);
        a.setBuildId("build-1");
        a.setApprovalId(1L);
        a.setAttemptNo(1);
        a.setOccurredAt(occurredAt);
        return a;
    }

    /** 标准「开放事实成立」现场：released 批次 + 快照含 item + 投影 opened + open/opened 追加事实。 */
    private void givenEstablishedOpenFact() {
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID)))).when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_OPENED))).when(deploymentMapper).selectList(any());
        doReturn(List.of(attempt(1L, RdmConstants.ATTEMPT_ACTION_OPEN, RdmConstants.ATTEMPT_RESULT_OPENED,
                LocalDateTime.of(2026, 10, 15, 10, 0)))).when(attemptMapper).selectList(any());
    }

    /* ==================== 用例 ==================== */

    @Test
    @DisplayName("四条件齐备时开放事实成立")
    void establishedWhenAllConditionsMet() {
        givenEstablishedOpenFact();
        assertTrue(service.isOpenFactEstablished(ITEM_ID));
        assertTrue(service.isBatchOpened(BATCH_ID));
    }

    @Test
    @DisplayName("fail-closed：deliveryItemId 为 null 一律 false，且不查库")
    void nullItemIdIsFalse() {
        assertFalse(service.isOpenFactEstablished(null));
        assertFalse(service.isBatchOpened(null));
    }

    @Test
    @DisplayName("条件1：候选批次查询必须绑定 status=released 与范围快照预筛， rolled_back 天然不命中")
    void noReleasedBatchMeansFalse() {
        // SQL 层过滤：mock mapper 不会自己执行 WHERE，这里让它模拟「只返回 released 行」的真实语义
        doReturn(new ArrayList<RdmReleaseBatch>()).when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_OPENED))).when(deploymentMapper).selectList(any());
        doReturn(List.of(attempt(1L, RdmConstants.ATTEMPT_ACTION_OPEN, RdmConstants.ATTEMPT_RESULT_OPENED,
                LocalDateTime.now()))).when(attemptMapper).selectList(any());
        assertFalse(service.isOpenFactEstablished(ITEM_ID),
                "回滚后批次状态不再是 released，开放事实必须被撤销");

        // 锁死过滤条件本身：候选批次查询必须同时绑定 released 状态与该交付项的快照预筛，
        // 否则「仅靠部署层判定」会在未来演进中静默放宽（批次已回滚但仍算开放）。
        service.isOpenFactEstablished(ITEM_ID);
        ArgumentCaptor<Wrapper<RdmReleaseBatch>> captor = ArgumentCaptor.forClass(Wrapper.class);
        verify(batchMapper, atLeastOnce()).selectList(captor.capture());
        List<String> bound = captor.getAllValues().stream()
                .flatMap(w -> boundParams(w).stream())
                .toList();
        assertTrue(bound.contains(RdmConstants.RB_RELEASED),
                "候选批次查询必须过滤 status=released，实际绑定参数: " + bound);
        assertTrue(bound.stream().anyMatch(v -> v.contains("\"deliveryItemId\":" + ITEM_ID)),
                "候选批次查询应用范围快照预筛收敛集合，实际绑定参数: " + bound);
    }

    @Test
    @DisplayName("条件1：范围快照必须精确包含该交付项（500 不得被 5001 命中）")
    void scopeMustContainItemExactly() {
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID_LOOKALIKE))))
                .when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_OPENED))).when(deploymentMapper).selectList(any());
        doReturn(List.of(attempt(1L, RdmConstants.ATTEMPT_ACTION_OPEN, RdmConstants.ATTEMPT_RESULT_OPENED,
                LocalDateTime.now()))).when(attemptMapper).selectList(any());
        assertFalse(service.isOpenFactEstablished(ITEM_ID), "LIKE 只是预筛，精确性必须由 JSON 解析保证");
    }

    @Test
    @DisplayName("条件2：部署投影 open_status != opened 时不成立")
    void projectionMustBeOpened() {
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID)))).when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_NOT_OPENED)))
                .when(deploymentMapper).selectList(any());
        doReturn(List.of(attempt(1L, RdmConstants.ATTEMPT_ACTION_OPEN, RdmConstants.ATTEMPT_RESULT_OPENED,
                LocalDateTime.now()))).when(attemptMapper).selectList(any());
        assertFalse(service.isOpenFactEstablished(ITEM_ID));
    }

    @Test
    @DisplayName("条件3：投影说已开放但缺少 open 追加事实 → 以不可变事实为准判未开放")
    void missingOpenAttemptMeansFalse() {
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID)))).when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_OPENED))).when(deploymentMapper).selectList(any());
        doReturn(List.of(attempt(1L, RdmConstants.ATTEMPT_ACTION_VERIFY, RdmConstants.ATTEMPT_RESULT_PASSED,
                LocalDateTime.now()))).when(attemptMapper).selectList(any());
        assertFalse(service.isOpenFactEstablished(ITEM_ID),
                "开放是独立事实，绝不可由「验证通过」推导");
    }

    @Test
    @DisplayName("条件3：open 追加事实 result=not_opened 时不成立")
    void openAttemptNotOpenedMeansFalse() {
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID)))).when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_OPENED))).when(deploymentMapper).selectList(any());
        doReturn(List.of(attempt(1L, RdmConstants.ATTEMPT_ACTION_OPEN, RdmConstants.ATTEMPT_RESULT_NOT_OPENED,
                LocalDateTime.now()))).when(attemptMapper).selectList(any());
        assertFalse(service.isOpenFactEstablished(ITEM_ID));
    }

    @Test
    @DisplayName("条件4（核心）：存在更晚的 rollback 事实 → 开放事实被撤销，路径B 业务验收重新被门禁")
    void laterRollbackRevokesOpenFact() {
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID)))).when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_OPENED))).when(deploymentMapper).selectList(any());
        doReturn(List.of(
                attempt(1L, RdmConstants.ATTEMPT_ACTION_OPEN, RdmConstants.ATTEMPT_RESULT_OPENED,
                        LocalDateTime.of(2026, 10, 15, 10, 0)),
                attempt(2L, RdmConstants.ATTEMPT_ACTION_ROLLBACK, RdmConstants.ATTEMPT_RESULT_ROLLED_BACK,
                        LocalDateTime.of(2026, 10, 15, 12, 0))))
                .when(attemptMapper).selectList(any());
        assertFalse(service.isOpenFactEstablished(ITEM_ID));
        assertFalse(service.isBatchOpened(BATCH_ID));
    }

    @Test
    @DisplayName("条件4：rollback 早于 open（回滚后重新开放）→ 开放事实重新成立")
    void reopenAfterEarlierRollbackIsEstablished() {
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID)))).when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_OPENED))).when(deploymentMapper).selectList(any());
        doReturn(List.of(
                attempt(1L, RdmConstants.ATTEMPT_ACTION_ROLLBACK, RdmConstants.ATTEMPT_RESULT_ROLLED_BACK,
                        LocalDateTime.of(2026, 10, 15, 10, 0)),
                attempt(2L, RdmConstants.ATTEMPT_ACTION_OPEN, RdmConstants.ATTEMPT_RESULT_OPENED,
                        LocalDateTime.of(2026, 10, 15, 12, 0))))
                .when(attemptMapper).selectList(any());
        assertTrue(service.isOpenFactEstablished(ITEM_ID));
    }

    @Test
    @DisplayName("事实先后全序：occurredAt 同刻（或为空）时退化比自增 id，不用字串字典序")
    void factOrderFallsBackToIdWhenSameInstant() {
        LocalDateTime same = LocalDateTime.of(2026, 10, 15, 10, 0);
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID)))).when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_OPENED))).when(deploymentMapper).selectList(any());
        // rollback 的 id 更大 → 更晚 → 撤销开放事实
        doReturn(List.of(
                attempt(10L, RdmConstants.ATTEMPT_ACTION_OPEN, RdmConstants.ATTEMPT_RESULT_OPENED, same),
                attempt(11L, RdmConstants.ATTEMPT_ACTION_ROLLBACK, RdmConstants.ATTEMPT_RESULT_ROLLED_BACK, same)))
                .when(attemptMapper).selectList(any());
        assertFalse(service.isOpenFactEstablished(ITEM_ID));

        // open 的 id 更大 → rollback 更早 → 开放事实成立
        doReturn(List.of(
                attempt(10L, RdmConstants.ATTEMPT_ACTION_ROLLBACK, RdmConstants.ATTEMPT_RESULT_ROLLED_BACK, same),
                attempt(11L, RdmConstants.ATTEMPT_ACTION_OPEN, RdmConstants.ATTEMPT_RESULT_OPENED, same)))
                .when(attemptMapper).selectList(any());
        assertTrue(service.isOpenFactEstablished(ITEM_ID));
    }

    @Test
    @DisplayName("多部署批次：只要有一个部署构成开放事实即批次已开放；开放事实归属须按 deploymentId 精确匹配")
    void otherDeploymentAttemptsDoNotLeakIntoThisOne() {
        RdmReleaseDeployment other = deployment(RdmConstants.OPEN_STATUS_NOT_OPENED);
        other.setId(DEPLOYMENT_ID + 1);
        other.setSystemCode("SYS_B");
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID)))).when(batchMapper).selectList(any());
        doReturn(List.of(deployment(RdmConstants.OPEN_STATUS_NOT_OPENED), other))
                .when(deploymentMapper).selectList(any());
        // open 事实挂在「另一个」部署上，不得让未开放的部署蒙混过关
        RdmReleaseAttempt foreign = attempt(1L, RdmConstants.ATTEMPT_ACTION_OPEN,
                RdmConstants.ATTEMPT_RESULT_OPENED, LocalDateTime.now());
        foreign.setDeploymentId(DEPLOYMENT_ID + 1);
        other.setOpenStatus(RdmConstants.OPEN_STATUS_OPENED);
        doReturn(List.of(foreign)).when(attemptMapper).selectList(any());

        assertTrue(service.isBatchOpened(BATCH_ID), "SYS_B 已开放，批次层面成立");
        assertTrue(service.isOpenFactEstablished(ITEM_ID));

        // 把 SYS_B 的投影改回未开放 → 批次不再开放（open 事实不会泄漏到 SYS_A）
        other.setOpenStatus(RdmConstants.OPEN_STATUS_NOT_OPENED);
        assertFalse(service.isBatchOpened(BATCH_ID));
        assertFalse(service.isOpenFactEstablished(ITEM_ID));
    }

    @Test
    @DisplayName("查不到任何部署记录时 fail-closed")
    void noDeploymentMeansFalse() {
        doReturn(List.of(batch(RdmConstants.RB_RELEASED, scope(ITEM_ID)))).when(batchMapper).selectList(any());
        doReturn(new ArrayList<RdmReleaseDeployment>()).when(deploymentMapper).selectList(any());
        assertFalse(service.isOpenFactEstablished(ITEM_ID));
        assertFalse(service.isBatchOpened(BATCH_ID));
    }

    @Test
    @DisplayName("范围快照只读投影：itemId 列表与行数保持一致，脏数据行被忽略而非抛错")
    void scopeProjectionIsReadOnlyAndTolerant() {
        assertEquals(List.of(ITEM_ID, ITEM_ID_LOOKALIKE), service.scopeItemIds(scope(ITEM_ID, ITEM_ID_LOOKALIKE)));
        assertEquals(0, service.scopeItemIds(null).size());
        assertEquals(0, service.scopeItemIds("not-a-json").size());
        assertEquals(2, service.scopeRows(scope(ITEM_ID, ITEM_ID_LOOKALIKE)).size());
    }

    /* ==================== 测试辅助 ==================== */

    /**
     * 还原 wrapper 实际绑定的参数值（用于断言查询口径，防假绿）。
     *
     * <p>{@code LambdaQueryWrapper} 把「列名段」与「值段」都包成延迟的 {@link ISqlSegment}，
     * 只有求值时 {@code formatParam} 才会写入 {@code paramNameValuePairs}；纯 mock 单测不走
     * MyBatis 执行链，故这里逐段主动求值。列名段依赖 TableInfo/Lambda 缓存，无容器时抛异常，忽略即可。
     */
    @SuppressWarnings("unchecked")
    private static List<String> boundParams(Object wrapper) {
        if (!(wrapper instanceof AbstractWrapper<?, ?, ?> abstractWrapper)) {
            return List.of();
        }
        for (ISqlSegment segment : abstractWrapper.getExpression().getNormal()) {
            try {
                segment.getSqlSegment();
            } catch (Exception | LinkageError ignored) {
                // 与取值无关
            }
        }
        return ((List<Object>) new ArrayList<Object>(abstractWrapper.getParamNameValuePairs().values()))
                .stream().map(String::valueOf).toList();
    }
}
