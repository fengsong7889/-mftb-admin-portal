package com.mftb.admin.service.agent;

import com.mftb.admin.dto.AiMyCenterDTO;
import com.mftb.admin.service.AiMyCenterService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 模型准入决策必须在所有入口保持相同语义，异常默认拒绝。 */
@ExtendWith(MockitoExtension.class)
class AiModelAdmissionServiceTest {
    @Mock private AiMyCenterService myCenterService;
    @Mock private AiKillSwitchService killSwitchService;
    @Mock private OperatorResolver operatorResolver;
    @Mock private com.mftb.admin.service.PermissionService permissions;
    @Mock private AiOutboundPolicyService outbound;
    private AiModelAdmissionService service;

    @BeforeEach
    void setup() {
        service = new AiModelAdmissionService(myCenterService, killSwitchService, operatorResolver, permissions, outbound);
        lenient().when(operatorResolver.currentOperatorAccount()).thenReturn("alice");
    }

    @Test
    void requiresAuthenticatedCallerBinding() {
        assertEquals("unauthorized", service.check("bob", "model").errorKind());
        verifyNoInteractions(myCenterService, killSwitchService);
    }

    @Test
    void killSwitchStopsAllModelEntryPoints() {
        when(killSwitchService.isEngaged()).thenReturn(true);
        assertEquals("kill_switch", service.check("alice", "model").errorKind());
        verifyNoInteractions(myCenterService);
    }

    @Test
    void failedKillSwitchLookupCannotFailOpen() {
        when(killSwitchService.isEngaged()).thenThrow(new IllegalStateException("internal details"));
        AiModelAdmissionService.Decision result = service.check("alice", "model");
        assertEquals("admission_unavailable", result.errorKind());
        assertFalse(result.message().contains("internal details"));
        verifyNoInteractions(myCenterService);
    }

    @Test
    void missingModelIsRejected() {
        assertFalse(service.check("alice", " ").allowed());
        verifyNoInteractions(myCenterService);
    }

    @Test
    void unauthorizedModelDoesNotQueryQuota() {
        when(myCenterService.hasModelAccess("model")).thenReturn(false);
        assertEquals("no_model_auth", service.check("alice", "model").errorKind());
        verify(myCenterService, never()).checkQuota(any(), any());
    }

    @ParameterizedTest
    @CsvSource({"approve,quota_approval_required", "downgrade,quota_downgrade_required", "reject,quota_reject", "unknown,admission_unavailable"})
    void nonAllowActionsCannotUseOriginalModelEvenWithAllowedFlag(String action, String reason) {
        when(myCenterService.hasModelAccess("model")).thenReturn(true);
        AiMyCenterDTO.QuotaCheckVO quota = new AiMyCenterDTO.QuotaCheckVO();
        quota.setAction(action);
        quota.setAllowed(true);
        when(myCenterService.checkQuota(null, "model")).thenReturn(quota);
        AiModelAdmissionService.Decision result = service.check("alice", "model");
        assertFalse(result.allowed());
        assertEquals(reason, result.errorKind());
    }

    @Test
    void absentQuotaDecisionIsNotUnlimitedQuota() {
        when(myCenterService.hasModelAccess("model")).thenReturn(true);
        assertEquals("admission_unavailable", service.check("alice", "model").errorKind());
    }

    @Test
    void failedQuotaLookupCannotFailOpen() {
        when(myCenterService.hasModelAccess("model")).thenReturn(true);
        when(myCenterService.checkQuota(null, "model")).thenThrow(new IllegalStateException("database error"));
        assertEquals("admission_unavailable", service.check("alice", "model").errorKind());
    }

    @Test
    void explicitAllowStillRequiresAllowedFlagAndNoPendingApproval() {
        when(myCenterService.hasModelAccess("model")).thenReturn(true);
        AiMyCenterDTO.QuotaCheckVO quota = new AiMyCenterDTO.QuotaCheckVO();
        quota.setAction("allow");
        when(myCenterService.checkQuota(null, "model")).thenReturn(quota);
        assertFalse(service.check("alice", "model").allowed());
        quota.setAllowed(true);
        quota.setRequiresApproval(true);
        assertEquals("quota_approval_required", service.check("alice", "model").errorKind());
        quota.setRequiresApproval(false);
        quota.setOverLimit(true);
        assertFalse(service.check("alice", "model").allowed());
        quota.setOverLimit(false);
        assertTrue(service.check("alice", "model").allowed());
    }
}
