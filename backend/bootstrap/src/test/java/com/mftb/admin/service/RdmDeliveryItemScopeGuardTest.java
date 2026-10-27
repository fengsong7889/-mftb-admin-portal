package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmDeliveryItemDTO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmEvidenceInvalidation;
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

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 交付项范围保护与证据失效测试（任务19 / 缺口4）。
 * <p>锁死三条口径：
 * <ol>
 *   <li>updateItem 分层校验：写权限 → V3 → 乐观锁 → 冻结保护，缺一不可；</li>
 *   <li>范围冻结后普通 PATCH 不得改范围/验收标准/验收路径/状态（改口径须走新范围版本）；</li>
 *   <li>范围变更使旧证据失效后，状态推导必须真实消费失效记录，允许「done → 回退」；
 *       无失效记录时保持单调前进，不无故打回。</li>
 * </ol>
 */
class RdmDeliveryItemScopeGuardTest {

    private static final long ITEM = 500L;
    private static final long REQ = 100L;
    private static final long OPERATOR = 41L;

    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private RdmTestBatchMapper testBatchMapper;
    private RdmWorkTaskMapper taskMapper;
    private RdmEvidenceInvalidationMapper evidenceInvalidationMapper;
    private RdmAccessGuard accessGuard;
    private RdmFlowVersionGuard flowVersionGuard;
    private RdmDeliveryItemService service;

    @BeforeEach
    void setUp() {
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        RdmRequirementMapper requirementMapper = mock(RdmRequirementMapper.class);
        taskMapper = mock(RdmWorkTaskMapper.class);
        testBatchMapper = mock(RdmTestBatchMapper.class);
        RdmTestExecutionMapper testExecutionMapper = mock(RdmTestExecutionMapper.class);
        acceptanceRecordMapper = mock(RdmAcceptanceRecordMapper.class);
        RdmIssueMapper issueMapper = mock(RdmIssueMapper.class);
        RdmProjectMapper projectMapper = mock(RdmProjectMapper.class);
        SysUserMapper userMapper = mock(SysUserMapper.class);
        BizSeqService bizSeqService = mock(BizSeqService.class);
        accessGuard = mock(RdmAccessGuard.class);
        evidenceInvalidationMapper = mock(RdmEvidenceInvalidationMapper.class);
        flowVersionGuard = mock(RdmFlowVersionGuard.class);
        RdmIdempotentService idempotentService = mock(RdmIdempotentService.class);
        // 任务33：失效过滤改由共享解析器承担，解析器包同一个 mock Mapper，桩数据口径不变
        service = new RdmDeliveryItemService(deliveryItemMapper, requirementMapper, taskMapper, testBatchMapper,
                testExecutionMapper, acceptanceRecordMapper, issueMapper, projectMapper, userMapper,
                bizSeqService, accessGuard, evidenceInvalidationMapper,
                new EvidenceValidityResolver(evidenceInvalidationMapper), flowVersionGuard, idempotentService);
        when(taskMapper.selectCount(any())).thenReturn(0L);
        when(testBatchMapper.selectList(any())).thenReturn(List.of());
    }

    private RdmDeliveryItem item(String status, Integer version, boolean frozen) {
        RdmDeliveryItem it = new RdmDeliveryItem();
        it.setId(ITEM);
        it.setReqId(REQ);
        it.setStatus(status);
        it.setVersion(version);
        it.setScopeVersion(1);
        it.setBlockedFlag(0);
        if (frozen) {
            it.setScopeFrozenAt(LocalDateTime.now());
        }
        return it;
    }

    private RdmDeliveryItemDTO.Update update(Integer expectedVersion) {
        RdmDeliveryItemDTO.Update dto = new RdmDeliveryItemDTO.Update();
        dto.setExpectedVersion(expectedVersion);
        return dto;
    }

    /* ==================== updateItem 分层校验 ==================== */

    @Test
    @DisplayName("非 V3 需求的交付项编辑被拒")
    void updateRequiresV3() {
        when(deliveryItemMapper.selectById(ITEM)).thenReturn(item(RdmConstants.DI_PREPARING, 5, false));
        when(flowVersionGuard.isDeliveryItemFlowV3(ITEM)).thenReturn(false);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.updateItem(ITEM, update(5), OPERATOR));
        assertTrue(ex.getMessage().contains("V3"), ex.getMessage());
    }

    @Test
    @DisplayName("乐观锁：expectedVersion 不匹配即拒")
    void updateOptimisticLock() {
        when(deliveryItemMapper.selectById(ITEM)).thenReturn(item(RdmConstants.DI_PREPARING, 5, false));
        when(flowVersionGuard.isDeliveryItemFlowV3(ITEM)).thenReturn(true);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.updateItem(ITEM, update(4), OPERATOR));
        assertTrue(ex.getMessage().contains("刷新"), ex.getMessage());
    }

    @Test
    @DisplayName("冻结保护：普通 PATCH 不得改范围描述")
    void frozenBlocksScopeEdit() {
        when(deliveryItemMapper.selectById(ITEM)).thenReturn(item(RdmConstants.DI_DEVELOPING, 5, true));
        when(flowVersionGuard.isDeliveryItemFlowV3(ITEM)).thenReturn(true);
        RdmDeliveryItemDTO.Update dto = update(5);
        dto.setScopeDesc("偷偷改範圍");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.updateItem(ITEM, dto, OPERATOR));
        assertTrue(ex.getMessage().contains("範圍已凍結"), ex.getMessage());
    }

    @Test
    @DisplayName("冻结保护：普通 PATCH 不得改状态")
    void frozenBlocksStatusEdit() {
        when(deliveryItemMapper.selectById(ITEM)).thenReturn(item(RdmConstants.DI_DEVELOPING, 5, true));
        when(flowVersionGuard.isDeliveryItemFlowV3(ITEM)).thenReturn(true);
        RdmDeliveryItemDTO.Update dto = update(5);
        dto.setStatus(RdmConstants.DI_DONE);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.updateItem(ITEM, dto, OPERATOR));
        assertTrue(ex.getMessage().contains("範圍已凍結"), ex.getMessage());
    }

    @Test
    @DisplayName("未冻结且版本匹配时正常更新（写权限已校验）")
    void updateHappyPath() {
        RdmDeliveryItem it = item(RdmConstants.DI_PREPARING, 5, false);
        when(deliveryItemMapper.selectById(ITEM)).thenReturn(it);
        when(flowVersionGuard.isDeliveryItemFlowV3(ITEM)).thenReturn(true);
        when(deliveryItemMapper.updateById(any(RdmDeliveryItem.class))).thenReturn(1);
        RdmDeliveryItemDTO.Update dto = update(5);
        dto.setTitle("新標題");
        service.updateItem(ITEM, dto, OPERATOR);
        verify(accessGuard).requireDeliveryWriter(REQ, "編輯交付項");
        assertEquals("新標題", it.getTitle());
    }

    /* ==================== recalculateStatus 证据失效消费 ==================== */

    private RdmAcceptanceRecord passedRecord(long id) {
        RdmAcceptanceRecord r = new RdmAcceptanceRecord();
        r.setId(id);
        r.setDeliveryItemId(ITEM);
        r.setConclusion(RdmConstants.ACCEPT_PASS);
        return r;
    }

    private RdmEvidenceInvalidation invalidation(long evidenceId, String type) {
        RdmEvidenceInvalidation inv = new RdmEvidenceInvalidation();
        inv.setDeliveryItemId(ITEM);
        inv.setEvidenceId(evidenceId);
        inv.setEvidenceType(type);
        return inv;
    }

    @Test
    @DisplayName("验收证据因范围变更失效后，done 被回退（真实消费失效记录）")
    void rollbackOnInvalidatedEvidence() {
        RdmDeliveryItem it = item(RdmConstants.DI_DONE, 1, false);
        when(deliveryItemMapper.selectById(ITEM)).thenReturn(it);
        when(deliveryItemMapper.updateById(any(RdmDeliveryItem.class))).thenReturn(1);
        // 存在一条通过的验收记录，但它已被登记失效
        when(acceptanceRecordMapper.selectList(any())).thenReturn(List.of(passedRecord(7L)));
        when(evidenceInvalidationMapper.selectList(any()))
                .thenReturn(List.of(invalidation(7L, RdmEvidenceInvalidation.TYPE_ACCEPTANCE)));
        when(evidenceInvalidationMapper.selectCount(any())).thenReturn(1L);

        service.recalculateStatus(ITEM);

        // 过滤失效证据后无有效凭证，状态从 done 回退到 preparing
        assertEquals(RdmConstants.DI_PREPARING, it.getStatus());
    }

    @Test
    @DisplayName("无失效记录时保持单调：即使推导值更低也不无故打回")
    void noRollbackWithoutInvalidation() {
        RdmDeliveryItem it = item(RdmConstants.DI_DONE, 1, false);
        when(deliveryItemMapper.selectById(ITEM)).thenReturn(it);
        when(deliveryItemMapper.updateById(any(RdmDeliveryItem.class))).thenReturn(1);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(List.of());
        when(evidenceInvalidationMapper.selectList(any())).thenReturn(List.of());
        when(evidenceInvalidationMapper.selectCount(any())).thenReturn(0L);

        service.recalculateStatus(ITEM);

        // 没有证据失效，done 不被回退
        assertEquals(RdmConstants.DI_DONE, it.getStatus());
    }

    @Test
    @DisplayName("有效验收证据存在时正常前进到 done")
    void forwardWhenEvidenceValid() {
        RdmDeliveryItem it = item(RdmConstants.DI_DEVELOPING, 1, false);
        it.setAcceptancePath(RdmConstants.PATH_B);
        when(deliveryItemMapper.selectById(ITEM)).thenReturn(it);
        when(deliveryItemMapper.updateById(any(RdmDeliveryItem.class))).thenReturn(1);
        when(acceptanceRecordMapper.selectList(any())).thenReturn(List.of(passedRecord(7L)));
        when(evidenceInvalidationMapper.selectList(any())).thenReturn(List.of());
        when(evidenceInvalidationMapper.selectCount(any())).thenReturn(0L);

        service.recalculateStatus(ITEM);

        assertEquals(RdmConstants.DI_DONE, it.getStatus());
    }
}
