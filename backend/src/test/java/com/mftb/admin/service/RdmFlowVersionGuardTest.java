package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * V3 整需求流转白名单测试（任务19 / 缺口1 + 缺口6）。
 * <p>锁死两条口径：
 * <ol>
 *   <li>V3 需求经 transition 只放行「准入 / 分配 / 受理 / 协调」前段动作；交付/测试/验收/发布类
 *       后段动作必须走交付项接口，不得经整需求流转绕过发布批次门禁（白名单 fail-closed）；</li>
 *   <li>V1/V2 语义完全不变：非 V3 需求不受白名单影响，任何动作都放行（由各自守卫处理）；</li>
 *   <li>缺口6：V3 实际发布能力仍被 ensureReleaseDisabledForV3 无条件拦截，未因白名单而弱化。</li>
 * </ol>
 */
class RdmFlowVersionGuardTest {

    private static final long V3_REQ = 300L;
    private static final long V2_REQ = 200L;

    private RdmRequirementMapper requirementMapper;
    private RdmFlowVersionGuard guard;

    @BeforeEach
    void setUp() {
        requirementMapper = mock(RdmRequirementMapper.class);
        RdmDeliveryItemMapper deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        when(requirementMapper.selectById(V3_REQ)).thenReturn(req(V3_REQ, RdmConstants.FLOW_VERSION_3));
        when(requirementMapper.selectById(V2_REQ)).thenReturn(req(V2_REQ, 2));
        guard = new RdmFlowVersionGuard(requirementMapper, deliveryItemMapper);
    }

    private static RdmRequirement req(long id, Integer flowVersion) {
        RdmRequirement r = new RdmRequirement();
        r.setId(id);
        r.setFlowVersion(flowVersion);
        return r;
    }

    @Test
    @DisplayName("V3 需求放行准入/分配/受理/协调等前段动作")
    void v3AllowsFrontStageActions() {
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V3_REQ, RdmConstants.ACTION_SUBMIT));
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V3_REQ, RdmConstants.ACTION_APPROVE_INTAKE));
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V3_REQ, RdmConstants.ACTION_DISPATCH));
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V3_REQ, RdmConstants.ACTION_ACCEPT));
    }

    @Test
    @DisplayName("V3 需求拒绝开发/测试/验收/发布等后段动作（必须走交付项接口）")
    void v3RejectsBackStageActions() {
        for (String action : new String[]{
                RdmConstants.ACTION_DEV_START, RdmConstants.ACTION_TEST_START,
                RdmConstants.ACTION_REVIEW_PASS, RdmConstants.ACTION_SUBMIT_UAT,
                RdmConstants.ACTION_RELEASE, RdmConstants.ACTION_VERIFY}) {
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> guard.requireV3TransitionAllowed(V3_REQ, action),
                    "动作应被拒绝: " + action);
            assertTrue(ex.getMessage().contains("交付項"), ex.getMessage());
        }
    }

    @Test
    @DisplayName("白名单 fail-closed：未显列入或空动作一律拒")
    void v3RejectsUnknownAction() {
        assertThrows(BusinessException.class,
                () -> guard.requireV3TransitionAllowed(V3_REQ, "some_future_action"));
        assertThrows(BusinessException.class,
                () -> guard.requireV3TransitionAllowed(V3_REQ, null));
    }

    @Test
    @DisplayName("V1/V2 语义不变：后段动作不受白名单影响，全部放行")
    void v1v2Unaffected() {
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V2_REQ, RdmConstants.ACTION_DEV_START));
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V2_REQ, RdmConstants.ACTION_RELEASE));
        // 需求不存在时也维持旧链路语义，不在此拦
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(999L, RdmConstants.ACTION_RELEASE));
    }

    @Test
    @DisplayName("缺口6：V3 发布能力仍被无条件拦截，白名单未弱化发布门禁")
    void releaseStillDisabledForV3() {
        assertThrows(BusinessException.class, () -> guard.ensureReleaseDisabledForV3(1L));
    }
}
