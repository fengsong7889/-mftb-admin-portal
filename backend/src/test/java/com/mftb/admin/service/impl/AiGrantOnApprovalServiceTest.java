package com.mftb.admin.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.entity.AiEmployeeAuth;
import com.mftb.admin.entity.AiGrantLog;
import com.mftb.admin.entity.OaRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiEmployeeAuthMapper;
import com.mftb.admin.mapper.AiGrantLogMapper;
import com.mftb.admin.mapper.AiQuotaOverrideMapper;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** V0 §B.4：审批通过即发放的幂等与失败审计单元测试 */
@ExtendWith(MockitoExtension.class)
class AiGrantOnApprovalServiceTest {

    @Mock private SysUserMapper sysUserMapper;
    @Mock private AiEmployeeAuthMapper employeeAuthMapper;
    @Mock private AiQuotaOverrideMapper quotaOverrideMapper;
    @Mock private AiGrantLogMapper grantLogMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void grantIdempotentSkipsWhenAlreadyGranted() {
        AiGrantOnApprovalServiceImpl service = newService();
        AiGrantLog already = new AiGrantLog();
        already.setStatus("GRANTED");
        when(grantLogMapper.selectOne(any())).thenReturn(already);

        service.grant(buildRequest(), "boss");

        verify(employeeAuthMapper, never()).insert(any(AiEmployeeAuth.class));
        verify(grantLogMapper, never()).insert(any(AiGrantLog.class));
    }

    @Test
    void grantWritesModelAuthAndLogOnFirstApprove() {
        AiGrantOnApprovalServiceImpl service = newService();
        when(grantLogMapper.selectOne(any())).thenReturn(null);
        SysUser applicant = new SysUser();
        applicant.setId(7L);
        applicant.setUsername("alice");
        when(sysUserMapper.selectOne(any())).thenReturn(applicant);
        when(employeeAuthMapper.selectOne(any())).thenReturn(null);

        service.grant(buildRequest(), "boss");

        ArgumentCaptor<AiEmployeeAuth> authCap = ArgumentCaptor.forClass(AiEmployeeAuth.class);
        verify(employeeAuthMapper, times(2)).insert(authCap.capture());
        List<AiEmployeeAuth> inserted = authCap.getAllValues();
        assertEquals(List.of(11L, 22L), inserted.stream().map(AiEmployeeAuth::getModelId).toList());
        inserted.forEach(a -> {
            assertEquals(7L, a.getEmployeeId());
            assertEquals(1, a.getHasPermission());
            assertEquals(1, a.getStatus());
        });

        ArgumentCaptor<AiGrantLog> logCap = ArgumentCaptor.forClass(AiGrantLog.class);
        verify(grantLogMapper).insert(logCap.capture());
        assertEquals("GRANTED", logCap.getValue().getStatus());
        assertEquals("AI202609230000001", logCap.getValue().getFlowNo());
    }

    @Test
    void grantRecordsFailedWhenApplicantUnresolvable() {
        AiGrantOnApprovalServiceImpl service = newService();
        when(grantLogMapper.selectOne(any())).thenReturn(null);
        when(sysUserMapper.selectOne(any())).thenReturn(null);

        assertThrows(IllegalStateException.class, () -> service.grant(buildRequest(), "boss"));

        ArgumentCaptor<AiGrantLog> cap = ArgumentCaptor.forClass(AiGrantLog.class);
        verify(grantLogMapper).insert(cap.capture());
        assertEquals("FAILED", cap.getValue().getStatus());
        assertNotNull(cap.getValue().getErrorMessage());
    }

    private AiGrantOnApprovalServiceImpl newService() {
        return new AiGrantOnApprovalServiceImpl(
                sysUserMapper, employeeAuthMapper, quotaOverrideMapper, grantLogMapper, objectMapper);
    }

    private OaRequest buildRequest() {
        OaRequest req = new OaRequest();
        req.setId(99L);
        req.setFlowNo("AI202609230000001");
        req.setProcessCode("ai_access");
        req.setApplicant("alice");
        req.setFormData("{\"requestedModels\":[{\"modelId\":11},{\"modelId\":22}]}");
        return req;
    }
}
