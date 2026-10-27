package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 需求结构绑定守卫测试（任务19 / 缺口3）。
 * <p>锁死主子需求绑定的安全口径：
 * <ol>
 *   <li>两端鉴权：父与子两侧都要有交付写权限（原来只校父侧）；</li>
 *   <li>父必须是 aggregate；父子均必须为 V3；父子必须同项目；</li>
 *   <li>单父约束与防环；</li>
 *   <li>绑定经 executeOnce 幂等入口进入 do* 纯逻辑。</li>
 * </ol>
 */
class RdmRequirementStructureGuardTest {

    private static final long PARENT = 1L;
    private static final long CHILD = 2L;
    private static final long OPERATOR = 41L;
    private static final long PROJECT = 10L;

    private RdmRequirementMapper requirementMapper;
    private RdmAccessGuard accessGuard;
    private RdmIdempotentService idempotentService;
    private RdmRequirementStructureService service;

    @BeforeEach
    void setUp() {
        requirementMapper = mock(RdmRequirementMapper.class);
        RdmDeliveryItemMapper deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        idempotentService = mock(RdmIdempotentService.class);
        // executeOnce 直接跑 supplier（离线单测不验证幂等底层），并保证派生键非空
        when(idempotentService.stableRequestHash(any())).thenReturn("stable-hash");
        when(idempotentService.executeOnce(any(), any(), any()))
                .thenAnswer(inv -> ((Supplier<?>) inv.getArgument(1)).get());
        when(requirementMapper.updateById(any(RdmRequirement.class))).thenReturn(1);
        service = new RdmRequirementStructureService(requirementMapper, deliveryItemMapper, accessGuard, idempotentService);
    }

    private RdmRequirement req(long id, String kind, Integer flowVersion, Long projectId) {
        RdmRequirement r = new RdmRequirement();
        r.setId(id);
        r.setRequirementKind(kind);
        r.setFlowVersion(flowVersion);
        r.setProjectId(projectId);
        return r;
    }

    private void stubHappyPath() {
        when(requirementMapper.selectById(PARENT))
                .thenReturn(req(PARENT, RdmConstants.KIND_AGGREGATE, RdmConstants.FLOW_VERSION_3, PROJECT));
        when(requirementMapper.selectById(CHILD))
                .thenReturn(req(CHILD, RdmConstants.KIND_EXECUTION, RdmConstants.FLOW_VERSION_3, PROJECT));
    }

    @Test
    @DisplayName("两端鉴权：父与子两侧都要校验交付写权限")
    void bothEndsAuthorized() {
        stubHappyPath();
        service.addChildRequirement(PARENT, CHILD, OPERATOR);
        verify(accessGuard).requireDeliveryWriter(eq(PARENT), anyString());
        verify(accessGuard).requireDeliveryWriter(eq(CHILD), anyString());
    }

    @Test
    @DisplayName("子侧无交付写权限时绑定被拒（不能只校父侧）")
    void childSideDenied() {
        stubHappyPath();
        doThrow(new BusinessException("無權限")).when(accessGuard).requireDeliveryWriter(eq(CHILD), anyString());
        assertThrows(BusinessException.class, () -> service.addChildRequirement(PARENT, CHILD, OPERATOR));
        verify(requirementMapper, never()).updateById(any(RdmRequirement.class));
    }

    @Test
    @DisplayName("父不是聚合需求时不能挂子需求")
    void parentMustBeAggregate() {
        when(requirementMapper.selectById(PARENT))
                .thenReturn(req(PARENT, RdmConstants.KIND_EXECUTION, RdmConstants.FLOW_VERSION_3, PROJECT));
        when(requirementMapper.selectById(CHILD))
                .thenReturn(req(CHILD, RdmConstants.KIND_EXECUTION, RdmConstants.FLOW_VERSION_3, PROJECT));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.addChildRequirement(PARENT, CHILD, OPERATOR));
        assertTrue(ex.getMessage().contains("聚合需求"), ex.getMessage());
    }

    @Test
    @DisplayName("父子均须为 V3：子为 V2 时拒绝")
    void bothMustBeV3() {
        when(requirementMapper.selectById(PARENT))
                .thenReturn(req(PARENT, RdmConstants.KIND_AGGREGATE, RdmConstants.FLOW_VERSION_3, PROJECT));
        when(requirementMapper.selectById(CHILD))
                .thenReturn(req(CHILD, RdmConstants.KIND_EXECUTION, 2, PROJECT));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.addChildRequirement(PARENT, CHILD, OPERATOR));
        assertTrue(ex.getMessage().contains("分批交付"), ex.getMessage());
    }

    @Test
    @DisplayName("父子必须同项目：跨项目挂结构被拒")
    void sameProjectRequired() {
        when(requirementMapper.selectById(PARENT))
                .thenReturn(req(PARENT, RdmConstants.KIND_AGGREGATE, RdmConstants.FLOW_VERSION_3, PROJECT));
        when(requirementMapper.selectById(CHILD))
                .thenReturn(req(CHILD, RdmConstants.KIND_EXECUTION, RdmConstants.FLOW_VERSION_3, 999L));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.addChildRequirement(PARENT, CHILD, OPERATOR));
        assertTrue(ex.getMessage().contains("同一項目"), ex.getMessage());
    }

    @Test
    @DisplayName("子已有结构父时拒绝（单父约束）")
    void singleParentConstraint() {
        when(requirementMapper.selectById(PARENT))
                .thenReturn(req(PARENT, RdmConstants.KIND_AGGREGATE, RdmConstants.FLOW_VERSION_3, PROJECT));
        RdmRequirement child = req(CHILD, RdmConstants.KIND_EXECUTION, RdmConstants.FLOW_VERSION_3, PROJECT);
        child.setStructureParentReqId(88L);
        when(requirementMapper.selectById(CHILD)).thenReturn(child);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.addChildRequirement(PARENT, CHILD, OPERATOR));
        assertTrue(ex.getMessage().contains("結構父"), ex.getMessage());
    }

    @Test
    @DisplayName("happy path：绑定成功后写入 structureParentReqId=父")
    void happyPathWritesStructureParent() {
        stubHappyPath();
        service.addChildRequirement(PARENT, CHILD, OPERATOR);
        ArgumentCaptor<RdmRequirement> captor = ArgumentCaptor.forClass(RdmRequirement.class);
        verify(requirementMapper).updateById(captor.capture());
        assertEquals(PARENT, captor.getValue().getStructureParentReqId());
    }

    @Test
    @DisplayName("不能把自己挂成自己的结构父")
    void cannotSelfParent() {
        assertThrows(BusinessException.class, () -> service.addChildRequirement(PARENT, PARENT, OPERATOR));
    }
}
