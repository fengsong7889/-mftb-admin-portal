package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmTestRoundMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 团队负载页「待受理批次指派执行人」测试（阶段 B-3.3b）。
 *
 * <p>锁死三条最关键的口径：
 * <ol>
 *   <li><b>轮次冻结保护</b>：仅 pending 批次可指派执行人；已受理（executing 等）一律拒绝，
 *       否则会和已冻结的 rdm_test_round 执行人集漂移；</li>
 *   <li><b>requireTestLead</b>：非本批次测试负责人（且非全量授权）不能指派；</li>
 *   <li><b>@Version 乐观锁</b>：版本不一致（他人已改/已受理）返回 CONFLICT，只一笔成功。</li>
 * </ol>
 *
 * <p>纯 Mockito 环境：assignExecutors 用 LambdaUpdateWrapper，须先 {@code initTableInfo(RdmTestBatch)}。
 */
class RdmTestBatchAssignExecutorsTest {

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, RdmTestBatch.class);
    }

    private RdmTestBatchMapper batchMapper;
    private RdmAccessGuard accessGuard;
    private OperatorResolver operatorResolver;
    private RdmTestBatchService service;

    @BeforeEach
    void setUp() {
        batchMapper = mock(RdmTestBatchMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        operatorResolver = mock(OperatorResolver.class);
        service = new RdmTestBatchService(
                batchMapper, mock(RdmTestExecutionMapper.class), mock(RdmDeliveryItemMapper.class),
                mock(RdmRequirementMapper.class), mock(RdmIssueMapper.class), accessGuard,
                mock(BizSeqService.class), operatorResolver, mock(RdmTestRoundMapper.class),
                mock(EvidenceValidityResolver.class), mock(RdmIdempotentService.class));
        // 非全量授权：requireTestLead 必须靠 currentUserId == testLeadUserId 通过
        when(accessGuard.canSeeAll(any())).thenReturn(false);
    }

    private static RdmTestBatch pendingBatch() {
        RdmTestBatch b = new RdmTestBatch();
        b.setId(300L);
        b.setBatchNo("TB20261019001");
        b.setStatus("pending");
        b.setVersion(0);
        b.setTestLeadUserId(5L);
        b.setTestLeadUserName("赵六");
        b.setExecutorUserIdsJson("[7]");
        return b;
    }

    @Test
    @DisplayName("待受理批次：测试负责人指派执行人成功（版本一致，走 @Version 条件更新）")
    void assignsExecutorOnPendingBatch() {
        when(batchMapper.selectById(any())).thenReturn(pendingBatch());
        when(batchMapper.update(any(), any())).thenReturn(1);

        service.assignExecutors(300L, List.of(20L), 0, 5L);

        verify(batchMapper).update(any(), any());
    }

    @Test
    @DisplayName("轮次冻结保护：已受理（executing）批次不可从负载页指派执行人")
    void rejectsNonPendingBatch() {
        RdmTestBatch executing = pendingBatch();
        executing.setStatus("executing");
        when(batchMapper.selectById(any())).thenReturn(executing);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.assignExecutors(300L, List.of(20L), 0, 5L));
        assertTrue(ex.getMessage().contains("待受理"), ex.getMessage());
    }

    @Test
    @DisplayName("requireTestLead：非本批次测试负责人不能指派执行人")
    void rejectsNonTestLead() {
        when(batchMapper.selectById(any())).thenReturn(pendingBatch());
        // currentUserId=99 不等于 testLeadUserId=5，且非全量授权
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.assignExecutors(300L, List.of(20L), 0, 99L));
        assertTrue(ex.getMessage().contains("測試負責人"), ex.getMessage());
    }

    @Test
    @DisplayName("@Version 冲突：批次已被他人改/已受理（affected=0）抛 CONFLICT")
    void rejectsVersionConflict() {
        when(batchMapper.selectById(any())).thenReturn(pendingBatch());
        when(batchMapper.update(any(), any())).thenReturn(0);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.assignExecutors(300L, List.of(20L), 0, 5L));
        assertTrue(ex.getMessage().contains("已被他人修改或已受理"), ex.getMessage());
    }
}
