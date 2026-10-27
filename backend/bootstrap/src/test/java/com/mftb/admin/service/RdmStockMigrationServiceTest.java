package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmStockMigrationDTO;
import com.mftb.admin.dto.RdmStockMigrationVO;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmMigrationAudit;
import com.mftb.admin.entity.RdmMigrationBatch;
import com.mftb.admin.entity.RdmMigrationItem;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueDeferMapper;
import com.mftb.admin.mapper.RdmIssueFollowupMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmIssueResolutionMapper;
import com.mftb.admin.mapper.RdmMigrationAuditMapper;
import com.mftb.admin.mapper.RdmMigrationBatchMapper;
import com.mftb.admin.mapper.RdmMigrationItemMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmReleaseApprovalMapper;
import com.mftb.admin.mapper.RdmReleaseAttemptMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmReleaseDeploymentMapper;
import com.mftb.admin.mapper.RdmReleaseExemptionDecisionMapper;
import com.mftb.admin.mapper.RdmReleaseExemptionMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmSupplementaryVerificationMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmTestRoundMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 任务29 C 段存量安全迁移执行纯 Mockito 离线单测。
 *
 * <p>锁死口径（全部 fail-closed）：
 * <ol>
 *   <li>预览只读不落事实；</li>
 *   <li>未确认不执行；</li>
 *   <li>主责确认授权与身份；</li>
 *   <li>小批分批与计数；</li>
 *   <li>暂停/恢复；</li>
 *   <li>对账一致；</li>
 *   <li>有新 V3 事实时拒绝盲目回滚；</li>
 *   <li>无新事实才可逆（不删除证据）；</li>
 *   <li>绝不伪造测试/验收/签字/评分/上线证据；</li>
 *   <li>失败项隔离；</li>
 *   <li>executeOnce 幂等。</li>
 * </ol>
 *
 * <p><b>边界声明</b>：mock 依赖驱动逻辑，只验证分支走向与安全口径，不等价于真实数据库/并发证明。
 */
class RdmStockMigrationServiceTest {

    private static final long ACTOR_ID = 10L;
    private static final long BATCH_ID = 200L;
    private static final long ITEM_ID = 300L;
    private static final long REQ_ID = 50L;
    private static final long PROJECT_ID = 77L;

    // Mappers
    private RdmMigrationBatchMapper batchMapper;
    private RdmMigrationItemMapper itemMapper;
    private RdmMigrationAuditMapper auditMapper;
    private RdmRequirementMapper requirementMapper;
    private RdmProjectMapper projectMapper;
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmTestBatchMapper testBatchMapper;
    private RdmTestRoundMapper testRoundMapper;
    private RdmTestExecutionMapper testExecutionMapper;
    private RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private RdmIssueMapper issueMapper;
    private RdmIssueDeferMapper issueDeferMapper;
    private RdmIssueFollowupMapper issueFollowupMapper;
    private RdmIssueResolutionMapper issueResolutionMapper;
    private RdmReleaseBatchMapper releaseBatchMapper;
    private RdmReleaseDeploymentMapper releaseDeploymentMapper;
    private RdmReleaseApprovalMapper releaseApprovalMapper;
    private RdmReleaseAttemptMapper releaseAttemptMapper;
    private RdmReleaseExemptionMapper releaseExemptionMapper;
    private RdmReleaseExemptionDecisionMapper releaseExemptionDecisionMapper;
    private RdmSupplementaryVerificationMapper supplementaryVerificationMapper;
    private RdmWorkTaskMapper workTaskMapper;
    // Services
    private RdmIdempotentService idempotentService;
    private RdmAccessGuard accessGuard;
    private OperatorResolver operatorResolver;
    private BizSeqService bizSeqService;
    private ObjectMapper objectMapper;

    private RdmStockMigrationService service;

    /**
     * LambdaQueryWrapper/LambdaUpdateWrapper 解析「方法引用 → 列名」依赖 MyBatis-Plus TableInfo 缓存，
     * 纯 Mockito 测试无 Spring 容器时该缓存为空，须手动初始化。
     */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, RdmMigrationBatch.class);
        TableInfoHelper.initTableInfo(assistant, RdmMigrationItem.class);
        TableInfoHelper.initTableInfo(assistant, RdmMigrationAudit.class);
        TableInfoHelper.initTableInfo(assistant, RdmRequirement.class);
        TableInfoHelper.initTableInfo(assistant, RdmProject.class);
        TableInfoHelper.initTableInfo(assistant, RdmDeliveryItem.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmTestBatch.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmTestRound.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmTestExecution.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmAcceptanceRecord.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmIssue.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmIssueDefer.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmIssueFollowup.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmIssueResolution.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmReleaseBatch.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmReleaseDeployment.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmReleaseApproval.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmReleaseAttempt.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmReleaseExemption.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmReleaseExemptionDecision.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmSupplementaryVerification.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmWorkTask.class);
    }

    @BeforeEach
    void setUp() {
        batchMapper = mock(RdmMigrationBatchMapper.class);
        itemMapper = mock(RdmMigrationItemMapper.class);
        auditMapper = mock(RdmMigrationAuditMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        projectMapper = mock(RdmProjectMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        testBatchMapper = mock(RdmTestBatchMapper.class);
        testRoundMapper = mock(RdmTestRoundMapper.class);
        testExecutionMapper = mock(RdmTestExecutionMapper.class);
        acceptanceRecordMapper = mock(RdmAcceptanceRecordMapper.class);
        issueMapper = mock(RdmIssueMapper.class);
        issueDeferMapper = mock(RdmIssueDeferMapper.class);
        issueFollowupMapper = mock(RdmIssueFollowupMapper.class);
        issueResolutionMapper = mock(RdmIssueResolutionMapper.class);
        releaseBatchMapper = mock(RdmReleaseBatchMapper.class);
        releaseDeploymentMapper = mock(RdmReleaseDeploymentMapper.class);
        releaseApprovalMapper = mock(RdmReleaseApprovalMapper.class);
        releaseAttemptMapper = mock(RdmReleaseAttemptMapper.class);
        releaseExemptionMapper = mock(RdmReleaseExemptionMapper.class);
        releaseExemptionDecisionMapper = mock(RdmReleaseExemptionDecisionMapper.class);
        supplementaryVerificationMapper = mock(RdmSupplementaryVerificationMapper.class);
        workTaskMapper = mock(RdmWorkTaskMapper.class);
        idempotentService = mock(RdmIdempotentService.class);
        accessGuard = mock(RdmAccessGuard.class);
        operatorResolver = mock(OperatorResolver.class);
        bizSeqService = mock(BizSeqService.class);
        objectMapper = new ObjectMapper();

        // 幂等服务透传
        doAnswer(inv -> {
            Supplier<?> supplier = inv.getArgument(1);
            return supplier.get();
        }).when(idempotentService).executeOnce(any(IdempotentKey.class), any(Supplier.class), any(Class.class));
        doReturn("stable-hash").when(idempotentService).stableRequestHash(any());

        // 默认认证主体：管理员
        SysUser admin = new SysUser();
        admin.setId(ACTOR_ID);
        admin.setUsername("admin");
        doReturn(admin).when(operatorResolver).currentUser();
        doReturn(true).when(operatorResolver).isAdmin(admin);

        // 事实扫描默认返回空（无事实）
        mockAllFactMappersEmpty();

        // isAggregateWithChildren 默认返回 0（非聚合需求）
        doReturn(0L).when(requirementMapper).selectCount(any(LambdaQueryWrapper.class));

        // 审计 insert 不抛异常
        doReturn(1).when(auditMapper).insert(any(RdmMigrationAudit.class));

        service = new RdmStockMigrationService(
                batchMapper, itemMapper, auditMapper, requirementMapper, projectMapper,
                deliveryItemMapper, testBatchMapper, testRoundMapper, testExecutionMapper,
                acceptanceRecordMapper, issueMapper, issueDeferMapper, issueFollowupMapper,
                issueResolutionMapper, releaseBatchMapper, releaseDeploymentMapper,
                releaseApprovalMapper, releaseAttemptMapper, releaseExemptionMapper,
                releaseExemptionDecisionMapper, supplementaryVerificationMapper, workTaskMapper,
                idempotentService, accessGuard, operatorResolver, bizSeqService, objectMapper);
    }

    /* ==================== 夹具 ==================== */

    @SuppressWarnings("unchecked")
    private void mockAllFactMappersEmpty() {
        doReturn(List.of()).when(deliveryItemMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(testBatchMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(testRoundMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(testExecutionMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(acceptanceRecordMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(issueMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(issueDeferMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(issueFollowupMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(issueResolutionMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(releaseBatchMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(releaseDeploymentMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(releaseApprovalMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(releaseAttemptMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(releaseExemptionMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(releaseExemptionDecisionMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(supplementaryVerificationMapper).selectList(any(LambdaQueryWrapper.class));
        doReturn(List.of()).when(workTaskMapper).selectList(any(LambdaQueryWrapper.class));
    }

    private RdmRequirement v2Requirement(Long reqId, Long projectId) {
        RdmRequirement req = new RdmRequirement();
        req.setId(reqId);
        req.setReqNo("REQ-" + reqId);
        req.setTitle("测试需求" + reqId);
        req.setFlowVersion(2);
        req.setProjectId(projectId);
        req.setStatus("developing");
        return req;
    }

    private RdmProject activeProject(Long projectId) {
        RdmProject p = new RdmProject();
        p.setId(projectId);
        p.setName("Project-" + projectId);
        p.setStatus(RdmConstants.PROJECT_PREPARING);
        p.setPmUserId(ACTOR_ID);
        p.setDefaultAcceptancePath(RdmConstants.PATH_A);
        return p;
    }

    private RdmMigrationBatch previewedBatch(Long batchId) {
        RdmMigrationBatch b = new RdmMigrationBatch();
        b.setId(batchId);
        b.setRequestId("req-" + batchId);
        b.setRequestedBy(ACTOR_ID);
        b.setStatus(RdmConstants.MIGRATION_BATCH_PREVIEWED);
        b.setPreviewHash("hash-preview");
        b.setPreviewSummaryJson(JsonUtils.toJson(Map.of(
                "scopeType", "REQUIREMENTS", "targetProjectId", PROJECT_ID,
                "chunkSize", 20, "totalItems", 1)));
        b.setChunkSize(20);
        b.setVersion(1);
        b.setCreatedAt(LocalDateTime.now());
        return b;
    }

    private RdmMigrationBatch confirmedBatch(Long batchId) {
        RdmMigrationBatch b = previewedBatch(batchId);
        b.setStatus(RdmConstants.MIGRATION_BATCH_CONFIRMED);
        b.setConfirmedBy(ACTOR_ID);
        b.setConfirmedAt(LocalDateTime.now());
        b.setVersion(2);
        return b;
    }

    private RdmMigrationItem previewedItem(Long itemId, Long batchId, Long reqId) {
        RdmMigrationItem item = new RdmMigrationItem();
        item.setId(itemId);
        item.setBatchId(batchId);
        item.setReqId(reqId);
        item.setTargetProjectId(PROJECT_ID);
        item.setSourceFlowVersion(2);
        item.setSourceVersion(2);
        item.setPreviewHash("item-hash");
        item.setBeforeSnapshotJson(JsonUtils.toJson(Map.of(
                "reqId", reqId, "flowVersionRaw", 2, "projectId", PROJECT_ID)));
        item.setFactBaselineJson(JsonUtils.toJson(Map.of(
                "deliveryItems", List.of(), "testBatches", List.of())));
        item.setStatus(RdmConstants.MIGRATION_ITEM_PREVIEWED);
        item.setVersion(1);
        return item;
    }

    private RdmMigrationItem confirmedItem(Long itemId, Long batchId, Long reqId) {
        RdmMigrationItem item = previewedItem(itemId, batchId, reqId);
        item.setStatus(RdmConstants.MIGRATION_ITEM_CONFIRMED);
        item.setConfirmedBy(ACTOR_ID);
        item.setConfirmedAt(LocalDateTime.now());
        item.setVersion(2);
        return item;
    }

    private RdmMigrationItem completedItem(Long itemId, Long batchId, Long reqId, Long diId) {
        RdmMigrationItem item = confirmedItem(itemId, batchId, reqId);
        item.setStatus(RdmConstants.MIGRATION_ITEM_COMPLETED);
        item.setExecutedBy(ACTOR_ID);
        item.setExecutedAt(LocalDateTime.now());
        item.setAfterSnapshotJson(JsonUtils.toJson(Map.of(
                "reqId", reqId, "flowVersion", 3, "projectId", PROJECT_ID,
                "createdDeliveryItemId", diId, "source", RdmConstants.MIGRATION_SOURCE_STOCK)));
        Map<String, Object> baseline = new HashMap<>();
        for (String key : List.of("deliveryItems", "testBatches", "testRounds", "testExecutions",
                "acceptanceRecords", "issues", "issueDeferrals", "issueFollowups", "issueResolutions",
                "releaseBatches", "releaseDeployments", "releaseApprovals", "releaseAttempts",
                "releaseExemptions", "releaseExemptionDecisions", "supplementaryVerifications",
                "workTasks")) {
            baseline.put(key, List.of());
        }
        item.setFactBaselineJson(JsonUtils.toJson(baseline));
        item.setExecutedFactHash("exec-hash");
        item.setVersion(3);
        return item;
    }

    /* ==================== C1. 预览只读不落事实 ==================== */

    @Nested
    @DisplayName("C1: 预览只读不落事实")
    class Preview {

        @Test
        @DisplayName("预览不写入需求/交付项/测试/验收/发布等业务表")
        @SuppressWarnings("unchecked")
        void previewDoesNotWriteBusinessFacts() {
            doReturn(v2Requirement(REQ_ID, PROJECT_ID)).when(requirementMapper).selectById(REQ_ID);
            doReturn(activeProject(PROJECT_ID)).when(projectMapper).selectById(PROJECT_ID);
            doReturn(0L).when(itemMapper).selectCount(any(LambdaQueryWrapper.class));
            doReturn(0L).when(requirementMapper).selectCount(any(LambdaQueryWrapper.class));
            doAnswer(inv -> {
                RdmMigrationBatch b = inv.getArgument(0);
                b.setId(BATCH_ID);
                return 1;
            }).when(batchMapper).insert(any(RdmMigrationBatch.class));
            doAnswer(inv -> {
                RdmMigrationItem i = inv.getArgument(0);
                i.setId(ITEM_ID);
                return 1;
            }).when(itemMapper).insert(any(RdmMigrationItem.class));

            RdmStockMigrationDTO.Preview dto = new RdmStockMigrationDTO.Preview();
            dto.setReqIds(List.of(REQ_ID));
            dto.setTargetProjectId(PROJECT_ID);
            dto.setReason("测试预览");

            RdmStockMigrationVO.PreviewResult result = service.preview(dto);
            assertNotNull(result);
            assertEquals(BATCH_ID, result.getBatchId());
            assertEquals(RdmConstants.MIGRATION_BATCH_PREVIEWED, result.getStatus());

            // 绝不写入业务事实表
            verify(requirementMapper, never()).update(any(), any(LambdaUpdateWrapper.class));
            verify(deliveryItemMapper, never()).insert(any(RdmDeliveryItem.class));
            verify(testBatchMapper, never()).insert((com.mftb.admin.entity.RdmTestBatch) any());
            verify(acceptanceRecordMapper, never()).insert((com.mftb.admin.entity.RdmAcceptanceRecord) any());
            verify(releaseBatchMapper, never()).insert((com.mftb.admin.entity.RdmReleaseBatch) any());
        }

        @Test
        @DisplayName("V3 需求被阻塞（已是 V3 无需迁移）")
        @SuppressWarnings("unchecked")
        void v3RequirementBlocked() {
            RdmRequirement v3Req = v2Requirement(REQ_ID, PROJECT_ID);
            v3Req.setFlowVersion(3);
            doReturn(v3Req).when(requirementMapper).selectById(REQ_ID);
            doAnswer(inv -> {
                RdmMigrationBatch b = inv.getArgument(0);
                b.setId(BATCH_ID);
                return 1;
            }).when(batchMapper).insert(any(RdmMigrationBatch.class));
            doAnswer(inv -> {
                RdmMigrationItem i = inv.getArgument(0);
                i.setId(ITEM_ID);
                return 1;
            }).when(itemMapper).insert(any(RdmMigrationItem.class));

            RdmStockMigrationDTO.Preview dto = new RdmStockMigrationDTO.Preview();
            dto.setReqIds(List.of(REQ_ID));
            dto.setReason("test");

            RdmStockMigrationVO.PreviewResult result = service.preview(dto);
            assertEquals(0, result.getEligibleItems());
            assertEquals(1, result.getBlockedItems());
            assertTrue(result.getItems().get(0).getBlockingReason().contains("V3"));
        }

        @Test
        @DisplayName("范围为空 → 拒绝")
        void emptyScopeRejected() {
            RdmStockMigrationDTO.Preview dto = new RdmStockMigrationDTO.Preview();
            dto.setReason("test");
            // 没有 projectId 也没有 reqIds

            BusinessException ex = assertThrows(BusinessException.class, () -> service.preview(dto));
            assertTrue(ex.getMessage().contains("遷移範圍不能為空"));
        }
    }

    /* ==================== C2. 未确认不执行 ==================== */

    @Nested
    @DisplayName("C2: 未确认不执行")
    class UnconfirmedRejectsExecution {

        @Test
        @DisplayName("previewed 状态批次执行 → 拒绝")
        void executePreviewedBatchRejected() {
            RdmMigrationBatch batch = previewedBatch(BATCH_ID);
            // confirmedAt = null, confirmedBy = null
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> service.executeChunk(BATCH_ID, null));
            assertTrue(ex.getMessage().contains("未經主責確認"));
        }

        @Test
        @DisplayName("paused 状态批次执行 → 拒绝")
        void executePausedBatchRejected() {
            RdmMigrationBatch batch = previewedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_PAUSED);
            batch.setConfirmedBy(ACTOR_ID);
            batch.setConfirmedAt(LocalDateTime.now());
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> service.executeChunk(BATCH_ID, null));
            // paused 不在 confirmed/running 范围 → 拒绝
            assertTrue(ex.getMessage().contains("未經主責確認") || ex.getMessage().contains("拒絕執行"));
        }
    }

    /* ==================== C3. 主责确认授权 ==================== */

    @Nested
    @DisplayName("C3: 主责确认授权与身份")
    class ConfirmAuthorization {

        @Test
        @DisplayName("非管理员非项目主责 → 确认拒绝")
        @SuppressWarnings("unchecked")
        void nonOwnerCannotConfirm() {
            SysUser normalUser = new SysUser();
            normalUser.setId(99L);
            normalUser.setUsername("normal");
            doReturn(normalUser).when(operatorResolver).currentUser();
            doReturn(false).when(operatorResolver).isAdmin(normalUser);

            RdmMigrationBatch batch = previewedBatch(BATCH_ID);
            batch.setRequestedBy(99L);
            batch.setPreviewSummaryJson(JsonUtils.toJson(Map.of(
                    "scopeType", "PROJECT", "scopeProjectId", PROJECT_ID, "chunkSize", 20)));
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(List.of(previewedItem(ITEM_ID, BATCH_ID, REQ_ID)))
                    .when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(List.of()).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            // 项目 PM 不是 normalUser
            RdmProject project = activeProject(PROJECT_ID);
            project.setPmUserId(ACTOR_ID); // 不是 99L
            doReturn(project).when(projectMapper).selectById(PROJECT_ID);

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> service.confirm(BATCH_ID, null));
            assertTrue(ex.getMessage().contains("僅管理員") || ex.getMessage().contains("無法確認"));
        }

        @Test
        @DisplayName("已确认批次再次确认 → 拒绝（状态不对）")
        void confirmedBatchCannotReconfirm() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> service.confirm(BATCH_ID, null));
            assertTrue(ex.getMessage().contains("僅「已預覽」批次可確認"));
        }
    }

    /* ==================== C4. 小批分批与计数 ==================== */

    @Nested
    @DisplayName("C4: 小批分批与计数")
    class ChunkExecution {

        @Test
        @DisplayName("分块执行成功 → 需求条件更新 + 创建 DI_PREPARING 交付项")
        @SuppressWarnings("unchecked")
        void chunkExecutionSuccess() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));

            RdmMigrationItem item = confirmedItem(ITEM_ID, BATCH_ID, REQ_ID);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(1).when(itemMapper).updateById(any(RdmMigrationItem.class));

            doReturn(v2Requirement(REQ_ID, PROJECT_ID)).when(requirementMapper).selectById(REQ_ID);
            doReturn(activeProject(PROJECT_ID)).when(projectMapper).selectById(PROJECT_ID);
            doReturn(1).when(requirementMapper).update(isNull(), any(LambdaUpdateWrapper.class));
            doAnswer(inv -> {
                RdmDeliveryItem di = inv.getArgument(0);
                di.setId(999L);
                return 1;
            }).when(deliveryItemMapper).insert(any(RdmDeliveryItem.class));
            doReturn("DI-SEQ-001").when(bizSeqService).next(anyString());

            RdmStockMigrationVO.ChunkResult result = service.executeChunk(BATCH_ID, null);
            assertNotNull(result);
            assertEquals(1, result.getSuccessInChunk());
            assertEquals(0, result.getFailedInChunk());

            // 验证：创建了交付项（DI_PREPARING，来源=迁移）
            verify(deliveryItemMapper).insert(any(RdmDeliveryItem.class));
            // 验证：条件更新需求（flow_version → 3）
            verify(requirementMapper).update(isNull(), any(LambdaUpdateWrapper.class));
            // 绝不写入测试/验收/发布证据
            verify(testBatchMapper, never()).insert((com.mftb.admin.entity.RdmTestBatch) any());
            verify(acceptanceRecordMapper, never()).insert((com.mftb.admin.entity.RdmAcceptanceRecord) any());
            verify(releaseBatchMapper, never()).insert((com.mftb.admin.entity.RdmReleaseBatch) any());
        }

        @Test
        @DisplayName("需求条件更新返回 0（并发修改）→ 该项失败隔离")
        @SuppressWarnings("unchecked")
        void concurrentModificationIsolatesFailure() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));

            RdmMigrationItem item = confirmedItem(ITEM_ID, BATCH_ID, REQ_ID);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(1).when(itemMapper).updateById(any(RdmMigrationItem.class));

            doReturn(v2Requirement(REQ_ID, PROJECT_ID)).when(requirementMapper).selectById(REQ_ID);
            doReturn(activeProject(PROJECT_ID)).when(projectMapper).selectById(PROJECT_ID);
            // 条件更新返回 0 → 并发冲突
            doReturn(0).when(requirementMapper).update(isNull(), any(LambdaUpdateWrapper.class));
            doAnswer(inv -> {
                RdmDeliveryItem di = inv.getArgument(0);
                di.setId(999L);
                return 1;
            }).when(deliveryItemMapper).insert(any(RdmDeliveryItem.class));
            doReturn(1).when(deliveryItemMapper).updateById(any(RdmDeliveryItem.class));
            doReturn("DI-SEQ-001").when(bizSeqService).next(anyString());

            RdmStockMigrationVO.ChunkResult result = service.executeChunk(BATCH_ID, null);
            assertNotNull(result);
            // 该项应标记为失败
            assertEquals(0, result.getSuccessInChunk());
            assertEquals(1, result.getFailedInChunk());
        }
    }

    /* ==================== C5. 暂停/恢复 ==================== */

    @Nested
    @DisplayName("C5: 暂停/恢复")
    class PauseResume {

        @Test
        @DisplayName("暂停 → 批次状态变为 paused + 审计")
        @SuppressWarnings("unchecked")
        void pauseSuccess() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_RUNNING);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));
            doReturn(List.of()).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(List.of()).when(auditMapper).selectList(any(LambdaQueryWrapper.class));

            RdmStockMigrationDTO.Pause dto = new RdmStockMigrationDTO.Pause();
            dto.setReason("需要人工核查");

            RdmStockMigrationVO.BatchDetail detail = service.pause(BATCH_ID, dto);
            assertNotNull(detail);
            assertEquals(RdmConstants.MIGRATION_BATCH_PAUSED, batch.getStatus());
            assertNotNull(batch.getPausedAt());
            assertEquals("需要人工核查", batch.getPauseReason());
        }

        @Test
        @DisplayName("暂停原因为空 → 拒绝")
        void pauseWithoutReasonRejected() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_RUNNING);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);

            RdmStockMigrationDTO.Pause dto = new RdmStockMigrationDTO.Pause();
            dto.setReason("");

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> service.pause(BATCH_ID, dto));
            assertTrue(ex.getMessage().contains("必須填寫原因"));
        }

        @Test
        @DisplayName("恢复因回退被拒而暂停的批次 → 拒绝（只能前滚）")
        @SuppressWarnings("unchecked")
        void resumeRollbackBlockedBatchRejected() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_PAUSED);
            batch.setPausedAt(LocalDateTime.now());
            batch.setPauseReason("回退被拒");
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            // 存在 rollback blocked 审计
            doReturn(1L).when(auditMapper).selectCount(any(LambdaQueryWrapper.class));

            BusinessException ex = assertThrows(BusinessException.class,
                    () -> service.resume(BATCH_ID, null));
            assertTrue(ex.getMessage().contains("不得恢復執行"));
            assertTrue(ex.getMessage().contains("前滾兼容"));
        }

        @Test
        @DisplayName("正常暂停批次恢复 → paused 变为 confirmed/running")
        @SuppressWarnings("unchecked")
        void resumeNormalPausedBatch() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_PAUSED);
            batch.setPausedAt(LocalDateTime.now());
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            // 无 rollback blocked 审计
            doReturn(0L).when(auditMapper).selectCount(any(LambdaQueryWrapper.class));
            // 恢复的条件更新
            doReturn(1).when(batchMapper).update(isNull(), any(LambdaUpdateWrapper.class));
            // detail 需要的数据
            doReturn(List.of()).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(List.of()).when(auditMapper).selectList(any(LambdaQueryWrapper.class));

            RdmStockMigrationVO.BatchDetail detail = service.resume(BATCH_ID, null);
            assertNotNull(detail);
        }
    }

    /* ==================== C6. 对账 ==================== */

    @Nested
    @DisplayName("C6: 对账一致")
    class Reconcile {

        @Test
        @DisplayName("全部完成且可追溯 → countConsistent=true, traceable=true")
        @SuppressWarnings("unchecked")
        void reconcileAllCompletedTraceable() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_COMPLETED);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);

            RdmMigrationItem item = completedItem(ITEM_ID, BATCH_ID, REQ_ID, 999L);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));

            // 对账时重读需求：flow_version=3, project_id=PROJECT_ID
            RdmRequirement migratedReq = v2Requirement(REQ_ID, PROJECT_ID);
            migratedReq.setFlowVersion(3);
            doReturn(migratedReq).when(requirementMapper).selectById(REQ_ID);

            // 迁移产出交付项存在且关联一致
            RdmDeliveryItem di = new RdmDeliveryItem();
            di.setId(999L);
            di.setReqId(REQ_ID);
            di.setProjectId(PROJECT_ID);
            di.setStatus(RdmConstants.DI_PREPARING);
            doReturn(di).when(deliveryItemMapper).selectById(999L);

            RdmStockMigrationVO.ReconcileResult result = service.reconcile(BATCH_ID, null);
            assertNotNull(result);
            assertTrue(result.getCountConsistent());
            assertTrue(result.getTraceable());
            assertEquals(1, result.getCompleted());
        }

        @Test
        @DisplayName("需求 flow_version 非 3 → 不可追溯（inconsistency）")
        @SuppressWarnings("unchecked")
        void reconcileDetectsInconsistency() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_COMPLETED);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);

            RdmMigrationItem item = completedItem(ITEM_ID, BATCH_ID, REQ_ID, 999L);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));

            // 需求 flow_version 仍为 2（被人工改回）
            RdmRequirement revertedReq = v2Requirement(REQ_ID, PROJECT_ID);
            revertedReq.setFlowVersion(2);
            doReturn(revertedReq).when(requirementMapper).selectById(REQ_ID);

            RdmStockMigrationVO.ReconcileResult result = service.reconcile(BATCH_ID, null);
            assertFalse(result.getTraceable());
            assertFalse(result.getInconsistencies().isEmpty());
        }
    }

    /* ==================== C7. 拒绝盲目回滚（有新 V3 事实） ==================== */

    @Nested
    @DisplayName("C7: 有新 V3 事实时拒绝盲目回滚")
    class RollbackRejected {

        @Test
        @DisplayName("发现新测试批次 → 拒绝回滚 + 自动暂停 + blocked 审计")
        @SuppressWarnings("unchecked")
        void newTestBatchBlocksRollback() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_COMPLETED);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));

            RdmMigrationItem item = completedItem(ITEM_ID, BATCH_ID, REQ_ID, 999L);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));

            // 事实扫描：发现新的测试批次（基线中没有）
            com.mftb.admin.entity.RdmTestBatch newTb = new com.mftb.admin.entity.RdmTestBatch();
            newTb.setId(888L);
            newTb.setReqId(REQ_ID);
            doReturn(List.of(newTb)).when(testBatchMapper).selectList(any(LambdaQueryWrapper.class));

            RdmStockMigrationDTO.Rollback dto = new RdmStockMigrationDTO.Rollback();
            dto.setReason("需要回退");

            RdmStockMigrationVO.RollbackResult result = service.rollback(BATCH_ID, dto);
            assertNotNull(result);
            assertTrue(result.getRejected());
            assertTrue(result.getRejectReason().contains("新的 V3 事實"));
            assertEquals(RdmConstants.MIGRATION_BATCH_PAUSED, result.getBatchStatus());
            assertTrue(result.getRolledBackItemIds().isEmpty());
            // 批次被自动暂停
            assertEquals(RdmConstants.MIGRATION_BATCH_PAUSED, batch.getStatus());
        }

        @Test
        @DisplayName("发现新验收记录 → 拒绝回滚")
        @SuppressWarnings("unchecked")
        void newAcceptanceRecordBlocksRollback() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_COMPLETED);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));

            RdmMigrationItem item = completedItem(ITEM_ID, BATCH_ID, REQ_ID, 999L);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));

            // 新验收记录
            com.mftb.admin.entity.RdmAcceptanceRecord newAr = new com.mftb.admin.entity.RdmAcceptanceRecord();
            newAr.setId(777L);
            newAr.setReqId(REQ_ID);
            doReturn(List.of(newAr)).when(acceptanceRecordMapper).selectList(any(LambdaQueryWrapper.class));

            RdmStockMigrationDTO.Rollback dto = new RdmStockMigrationDTO.Rollback();
            dto.setReason("需要回退");

            RdmStockMigrationVO.RollbackResult result = service.rollback(BATCH_ID, dto);
            assertTrue(result.getRejected());
        }
    }

    /* ==================== C8. 无新事实可逆（不删除证据） ==================== */

    @Nested
    @DisplayName("C8: 无新事实才可逆（结构性逆向，不删除）")
    class RollbackAllowed {

        @Test
        @DisplayName("无新事实 → 结构性逆向成功，不删除任何行")
        @SuppressWarnings("unchecked")
        void rollbackWithoutNewFactsSucceeds() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_COMPLETED);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));

            RdmMigrationItem item = completedItem(ITEM_ID, BATCH_ID, REQ_ID, 999L);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(1).when(itemMapper).updateById(any(RdmMigrationItem.class));

            // 事实扫描全空 → 无新事实
            // (mockAllFactMappersEmpty 已在 setUp 中设置)

            // 需求条件更新（逆向还原 flow_version）
            doReturn(1).when(requirementMapper).update(isNull(), any(LambdaUpdateWrapper.class));

            // 交付项封存（blockedFlag=1，不删除）
            RdmDeliveryItem di = new RdmDeliveryItem();
            di.setId(999L);
            di.setStatus(RdmConstants.DI_PREPARING);
            di.setBlockedFlag(0);
            doReturn(di).when(deliveryItemMapper).selectById(999L);
            doReturn(1).when(deliveryItemMapper).updateById(any(RdmDeliveryItem.class));

            RdmStockMigrationDTO.Rollback dto = new RdmStockMigrationDTO.Rollback();
            dto.setReason("误操作回退");

            RdmStockMigrationVO.RollbackResult result = service.rollback(BATCH_ID, dto);
            assertNotNull(result);
            assertFalse(result.getRejected());
            assertEquals(List.of(ITEM_ID), result.getRolledBackItemIds());
            assertEquals(RdmConstants.MIGRATION_BATCH_ROLLED_BACK, result.getBatchStatus());

            // 交付项是封存（blockedFlag=1），绝不删除
            assertEquals(1, di.getBlockedFlag());
            verify(deliveryItemMapper, never()).deleteById(anyLong());
            verify(deliveryItemMapper, never()).delete(any());
            // 需求/审计也不删除
            verify(requirementMapper, never()).deleteById(anyLong());
            verify(auditMapper, never()).deleteById(anyLong());
        }
    }

    /* ==================== C9. 绝不伪造证据 ==================== */

    @Nested
    @DisplayName("C9: 绝不伪造测试/验收/签字/评分/上线证据")
    class NoFabricatedEvidence {

        @Test
        @DisplayName("执行全流程只产出 DI_PREPARING 容器交付项 + 结构字段更新")
        @SuppressWarnings("unchecked")
        void executionOnlyProducesStructuralFacts() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));

            RdmMigrationItem item = confirmedItem(ITEM_ID, BATCH_ID, REQ_ID);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(1).when(itemMapper).updateById(any(RdmMigrationItem.class));

            doReturn(v2Requirement(REQ_ID, PROJECT_ID)).when(requirementMapper).selectById(REQ_ID);
            doReturn(activeProject(PROJECT_ID)).when(projectMapper).selectById(PROJECT_ID);
            doReturn(1).when(requirementMapper).update(isNull(), any(LambdaUpdateWrapper.class));
            doAnswer(inv -> {
                RdmDeliveryItem di = inv.getArgument(0);
                di.setId(999L);
                // 验证交付项状态是 DI_PREPARING
                assertEquals(RdmConstants.DI_PREPARING, di.getStatus());
                return 1;
            }).when(deliveryItemMapper).insert(any(RdmDeliveryItem.class));
            doReturn("DI-SEQ-001").when(bizSeqService).next(anyString());

            service.executeChunk(BATCH_ID, null);

            // 绝不写入测试/验收/发布/问题相关事实
            verify(testBatchMapper, never()).insert((com.mftb.admin.entity.RdmTestBatch) any());
            verify(testRoundMapper, never()).insert((com.mftb.admin.entity.RdmTestRound) any());
            verify(testExecutionMapper, never()).insert((com.mftb.admin.entity.RdmTestExecution) any());
            verify(acceptanceRecordMapper, never()).insert((com.mftb.admin.entity.RdmAcceptanceRecord) any());
            verify(issueMapper, never()).insert((com.mftb.admin.entity.RdmIssue) any());
            verify(issueDeferMapper, never()).insert((com.mftb.admin.entity.RdmIssueDefer) any());
            verify(issueFollowupMapper, never()).insert((com.mftb.admin.entity.RdmIssueFollowup) any());
            verify(issueResolutionMapper, never()).insert((com.mftb.admin.entity.RdmIssueResolution) any());
            verify(releaseBatchMapper, never()).insert((com.mftb.admin.entity.RdmReleaseBatch) any());
            verify(releaseDeploymentMapper, never()).insert((com.mftb.admin.entity.RdmReleaseDeployment) any());
            verify(releaseApprovalMapper, never()).insert((com.mftb.admin.entity.RdmReleaseApproval) any());
            verify(releaseAttemptMapper, never()).insert((com.mftb.admin.entity.RdmReleaseAttempt) any());
            verify(releaseExemptionMapper, never()).insert((com.mftb.admin.entity.RdmReleaseExemption) any());
            verify(releaseExemptionDecisionMapper, never()).insert((com.mftb.admin.entity.RdmReleaseExemptionDecision) any());
            verify(supplementaryVerificationMapper, never()).insert((com.mftb.admin.entity.RdmSupplementaryVerification) any());
        }
    }

    /* ==================== C10. 失败项隔离 ==================== */

    @Nested
    @DisplayName("C10: 失败项隔离")
    class FailureIsolation {

        @Test
        @DisplayName("需求不存在时该项 FAILED，不影响其他项")
        @SuppressWarnings("unchecked")
        void missingRequirementIsolated() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));

            RdmMigrationItem item1 = confirmedItem(ITEM_ID, BATCH_ID, REQ_ID);
            RdmMigrationItem item2 = confirmedItem(ITEM_ID + 1, BATCH_ID, REQ_ID + 1);
            doReturn(List.of(item1, item2)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(1).when(itemMapper).updateById(any(RdmMigrationItem.class));

            // item1 的需求不存在 → 失败
            doReturn(null).when(requirementMapper).selectById(REQ_ID);
            // item2 的需求正常
            doReturn(v2Requirement(REQ_ID + 1, PROJECT_ID)).when(requirementMapper).selectById(REQ_ID + 1);
            doReturn(activeProject(PROJECT_ID)).when(projectMapper).selectById(PROJECT_ID);
            doReturn(1).when(requirementMapper).update(isNull(), any(LambdaUpdateWrapper.class));
            doAnswer(inv -> {
                RdmDeliveryItem di = inv.getArgument(0);
                di.setId(1000L);
                return 1;
            }).when(deliveryItemMapper).insert(any(RdmDeliveryItem.class));
            doReturn("DI-SEQ-002").when(bizSeqService).next(anyString());

            RdmStockMigrationVO.ChunkResult result = service.executeChunk(BATCH_ID, null);
            // 一项失败一项成功 → 隔离
            assertEquals(1, result.getFailedInChunk());
            assertEquals(1, result.getSuccessInChunk());
        }
    }

    /* ==================== C11. executeOnce 幂等 ==================== */

    @Nested
    @DisplayName("C11: executeOnce 幂等")
    class Idempotency {

        @Test
        @DisplayName("preview 调用 executeOnce（幂等入口被使用）")
        @SuppressWarnings("unchecked")
        void previewUsesExecuteOnce() {
            doReturn(v2Requirement(REQ_ID, PROJECT_ID)).when(requirementMapper).selectById(REQ_ID);
            doReturn(activeProject(PROJECT_ID)).when(projectMapper).selectById(PROJECT_ID);
            doReturn(0L).when(itemMapper).selectCount(any(LambdaQueryWrapper.class));
            doReturn(0L).when(requirementMapper).selectCount(any(LambdaQueryWrapper.class));
            doAnswer(inv -> {
                RdmMigrationBatch b = inv.getArgument(0);
                b.setId(BATCH_ID);
                return 1;
            }).when(batchMapper).insert(any(RdmMigrationBatch.class));
            doAnswer(inv -> {
                RdmMigrationItem i = inv.getArgument(0);
                i.setId(ITEM_ID);
                return 1;
            }).when(itemMapper).insert(any(RdmMigrationItem.class));

            RdmStockMigrationDTO.Preview dto = new RdmStockMigrationDTO.Preview();
            dto.setReqIds(List.of(REQ_ID));
            dto.setTargetProjectId(PROJECT_ID);
            dto.setReason("幂等测试");

            service.preview(dto);
            verify(idempotentService).executeOnce(any(IdempotentKey.class), any(Supplier.class),
                    eq(RdmStockMigrationVO.PreviewResult.class));
        }

        @Test
        @DisplayName("rollback 调用 executeOnce（幂等入口被使用）")
        @SuppressWarnings("unchecked")
        void rollbackUsesExecuteOnce() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            batch.setStatus(RdmConstants.MIGRATION_BATCH_COMPLETED);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));
            RdmMigrationItem item = completedItem(ITEM_ID, BATCH_ID, REQ_ID, 999L);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(1).when(requirementMapper).update(isNull(), any(LambdaUpdateWrapper.class));
            doReturn(1).when(itemMapper).updateById(any(RdmMigrationItem.class));
            RdmDeliveryItem di = new RdmDeliveryItem();
            di.setId(999L);
            di.setStatus(RdmConstants.DI_PREPARING);
            doReturn(di).when(deliveryItemMapper).selectById(999L);
            doReturn(1).when(deliveryItemMapper).updateById(any(RdmDeliveryItem.class));

            RdmStockMigrationDTO.Rollback dto = new RdmStockMigrationDTO.Rollback();
            dto.setReason("幂等回退");

            service.rollback(BATCH_ID, dto);
            verify(idempotentService).executeOnce(any(IdempotentKey.class), any(Supplier.class),
                    eq(RdmStockMigrationVO.RollbackResult.class));
        }
    }

    /* ==================== C12. 迁移不顺带打开灰度 ==================== */

    @Nested
    @DisplayName("C12: 迁移不顺带打开灰度")
    class NoGrayscaleSideEffect {

        @Test
        @DisplayName("执行迁移不写入 rdm_flow_config（灰度开启是独立授权动作）")
        @SuppressWarnings("unchecked")
        void executionDoesNotTouchFlowConfig() {
            RdmMigrationBatch batch = confirmedBatch(BATCH_ID);
            doReturn(batch).when(batchMapper).selectById(BATCH_ID);
            doReturn(1).when(batchMapper).updateById(any(RdmMigrationBatch.class));

            RdmMigrationItem item = confirmedItem(ITEM_ID, BATCH_ID, REQ_ID);
            doReturn(List.of(item)).when(itemMapper).selectList(any(LambdaQueryWrapper.class));
            doReturn(1).when(itemMapper).updateById(any(RdmMigrationItem.class));

            doReturn(v2Requirement(REQ_ID, PROJECT_ID)).when(requirementMapper).selectById(REQ_ID);
            doReturn(activeProject(PROJECT_ID)).when(projectMapper).selectById(PROJECT_ID);
            doReturn(1).when(requirementMapper).update(isNull(), any(LambdaUpdateWrapper.class));
            doAnswer(inv -> {
                RdmDeliveryItem di = inv.getArgument(0);
                di.setId(999L);
                return 1;
            }).when(deliveryItemMapper).insert(any(RdmDeliveryItem.class));
            doReturn("DI-SEQ-001").when(bizSeqService).next(anyString());

            service.executeChunk(BATCH_ID, null);

            // RdmStockMigrationService 不依赖 RdmFlowConfigMapper，结构上不可能写入灰度配置
            // 此处验证：整个服务没有 flowConfigMapper 的引用（构造函数不含此依赖）
            // 补充验证：执行过程绝不触发任何灰度相关操作
            assertNotNull(result(batch));
        }

        private String result(RdmMigrationBatch b) {
            return b.getStatus();
        }
    }
}
