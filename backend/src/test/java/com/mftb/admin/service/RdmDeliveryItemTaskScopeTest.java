package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmEvidenceInvalidationMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 按任务提测范围解析单测（研发「按任务交付给测试」入口）。
 *
 * <p>钉住三件事：已有交付项的任务直接复用、未挂交付项的任务归入默认交付项并回填任务、
 * 跨需求任务一律拒绝（否则会冻结出越界提测快照）。
 */
class RdmDeliveryItemTaskScopeTest {

    private static final long REQ = 4L;
    private static final long USER = 41L;

    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmRequirementMapper requirementMapper;
    private RdmWorkTaskMapper taskMapper;
    private BizSeqService bizSeqService;
    private RdmFlowVersionGuard flowVersionGuard;
    private RdmDeliveryItemService service;

    @BeforeEach
    void setUp() {
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        taskMapper = mock(RdmWorkTaskMapper.class);
        bizSeqService = mock(BizSeqService.class);
        flowVersionGuard = mock(RdmFlowVersionGuard.class);
        service = new RdmDeliveryItemService(
                deliveryItemMapper, requirementMapper, taskMapper,
                mock(RdmTestBatchMapper.class), mock(RdmTestExecutionMapper.class),
                mock(RdmAcceptanceRecordMapper.class), mock(RdmIssueMapper.class),
                mock(RdmProjectMapper.class), mock(SysUserMapper.class), bizSeqService,
                mock(RdmAccessGuard.class), mock(RdmEvidenceInvalidationMapper.class),
                mock(EvidenceValidityResolver.class), flowVersionGuard,
                mock(RdmIdempotentService.class));
    }

    private RdmWorkTask task(long id, Long reqId, Long deliveryItemId) {
        RdmWorkTask task = new RdmWorkTask();
        task.setId(id);
        task.setTaskNo("RT" + id);
        task.setTitle("任务" + id);
        task.setReqId(reqId);
        task.setDeliveryItemId(deliveryItemId);
        task.setStatus("done");
        return task;
    }

    private RdmDeliveryItem item(long id, Long reqId) {
        RdmDeliveryItem item = new RdmDeliveryItem();
        item.setId(id);
        item.setReqId(reqId);
        item.setItemNo("DI" + id);
        item.setTitle("交付项" + id);
        item.setStatus("developing");
        return item;
    }

    @Test
    @DisplayName("任务已挂交付项：直接复用，不新建、不回填")
    void reusesExistingDeliveryItem() {
        RdmWorkTask t1 = task(11L, REQ, 100L);
        RdmWorkTask t2 = task(12L, REQ, 100L);
        when(taskMapper.selectBatchIds(any())).thenReturn(List.of(t1, t2));
        when(deliveryItemMapper.selectById(100L)).thenReturn(item(100L, REQ));

        List<RdmDeliveryItem> result = service.resolveTaskScope(REQ, List.of(11L, 12L), USER);

        assertEquals(1, result.size(), "两条任务挂同一交付项时应合并为一条");
        assertEquals(100L, result.get(0).getId());
        verify(deliveryItemMapper, never()).insert(any(RdmDeliveryItem.class));
        verify(taskMapper, never()).updateById(any(RdmWorkTask.class));
    }

    @Test
    @DisplayName("任务未挂交付项：归入需求默认交付项并回填 task.delivery_item_id")
    void createsDefaultItemAndBackfillsTask() {
        RdmWorkTask t = task(11L, REQ, null);
        when(taskMapper.selectBatchIds(any())).thenReturn(List.of(t));
        // getOrCreateDefaultItem：需求下还没有交付项 → 自动创建
        when(deliveryItemMapper.selectList(any())).thenReturn(List.of());
        RdmRequirement req = new RdmRequirement();
        req.setId(REQ);
        req.setTitle("推广金重构");
        when(requirementMapper.selectById(REQ)).thenReturn(req);
        when(bizSeqService.next("rdm_delivery_item")).thenReturn("DI202610200001");
        doAnswer(inv -> {
            ((RdmDeliveryItem) inv.getArgument(0)).setId(200L);
            return 1;
        }).when(deliveryItemMapper).insert(any(RdmDeliveryItem.class));

        List<RdmDeliveryItem> result = service.resolveTaskScope(REQ, List.of(11L), USER);

        assertEquals(1, result.size());
        assertEquals(200L, result.get(0).getId());
        ArgumentCaptor<RdmWorkTask> updated = ArgumentCaptor.forClass(RdmWorkTask.class);
        verify(taskMapper).updateById(updated.capture());
        assertEquals(200L, updated.getValue().getDeliveryItemId(), "任务必须回填交付项，下次提测才能直接复用");
    }

    @Test
    @DisplayName("任务不属于当前需求：拒绝，避免冻结出越界提测范围")
    void rejectsTaskFromAnotherRequirement() {
        when(taskMapper.selectBatchIds(any())).thenReturn(List.of(task(11L, 99L, 100L)));

        assertThrows(BusinessException.class,
                () -> service.resolveTaskScope(REQ, List.of(11L), USER));
    }
}
