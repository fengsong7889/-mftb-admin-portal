package com.mftb.admin.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.entity.AiEmployeeAuth;
import com.mftb.admin.entity.AiGrantLog;
import com.mftb.admin.entity.AiQuotaOverride;
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

    /**
     * 真实单据的 applicant 是「姓名(工号)」签名（OperatorResolver.operatorSignature），
     * 不能拿整串等值匹配 username/name —— 旧实现因此终审必抛「无法解析申请人」→ 「系統繁忙」。
     */
    @Test
    void grantResolvesApplicantFromSignature() {
        AiGrantOnApprovalServiceImpl service = newService();
        when(grantLogMapper.selectOne(any())).thenReturn(null);
        SysUser applicant = new SysUser();
        applicant.setId(7L);
        applicant.setUsername("MF00002");
        applicant.setName("冯松");
        applicant.setEmpId("MF00002");
        when(sysUserMapper.selectOne(any())).thenReturn(applicant);
        when(employeeAuthMapper.selectOne(any())).thenReturn(null);

        OaRequest req = buildRequest();
        req.setApplicant("冯松(MF00002)");
        service.grant(req, "boss");

        verify(employeeAuthMapper, times(2)).insert(any(AiEmployeeAuth.class));
        assertEquals("MF00002", AiGrantOnApprovalServiceImpl.extractEmpId("冯松(MF00002)"));
        assertEquals("冯松", AiGrantOnApprovalServiceImpl.stripSignature("冯松（MF00002）"));
    }

    /** 审批人勾选的 approvedModels 必须优先于申请人 requestedModels，否则审批裁定被忽略。 */
    @Test
    void grantPrefersApprovedModelsOverRequested() {
        AiGrantOnApprovalServiceImpl service = newService();
        when(grantLogMapper.selectOne(any())).thenReturn(null);
        when(sysUserMapper.selectOne(any())).thenReturn(applier());
        when(employeeAuthMapper.selectOne(any())).thenReturn(null);

        OaRequest req = buildRequest();
        req.setApplicant("alice");
        req.setFormData("{\"requestedModels\":[11,22],\"approvedModels\":[33]}");
        service.grant(req, "boss");

        ArgumentCaptor<AiEmployeeAuth> cap = ArgumentCaptor.forClass(AiEmployeeAuth.class);
        verify(employeeAuthMapper, times(1)).insert(cap.capture());
        assertEquals(33L, cap.getValue().getModelId());
    }

    /** 当前前端发的是扁平额度字段，必须能落 ai_quota_override，且 requests 归一为 request。 */
    @Test
    void grantWritesFlatQuotaFieldsWithNormalizedType() {
        AiGrantOnApprovalServiceImpl service = newService();
        when(grantLogMapper.selectOne(any())).thenReturn(null);
        when(sysUserMapper.selectOne(any())).thenReturn(applier());
        when(employeeAuthMapper.selectOne(any())).thenReturn(null);

        OaRequest req = buildRequest();
        req.setApplicant("alice");
        req.setFormData("{\"requestedModels\":[11],\"approvedQuotaType\":\"requests\","
                + "\"approvedQuotaValue\":100,\"approvedQuotaPeriod\":\"monthly\","
                + "\"quotaEffectiveType\":\"temporary\",\"quotaExpireAt\":\"2026-12-31\","
                + "\"approvedOverLimitAction\":\"reject\"}");
        service.grant(req, "boss");

        ArgumentCaptor<AiQuotaOverride> cap = ArgumentCaptor.forClass(AiQuotaOverride.class);
        verify(quotaOverrideMapper).insert(cap.capture());
        AiQuotaOverride saved = cap.getValue();
        assertEquals("request", saved.getQuotaType());
        assertEquals("monthly", saved.getQuotaPeriod());
        assertEquals("temporary", saved.getEffectiveType());
        assertNotNull(saved.getExpireAt());
        assertEquals(0, saved.getQuotaValue().compareTo(new java.math.BigDecimal("100")));
    }

    /** 历史 FAILED 记录必须复用同一行更新为 GRANTED，不能撞 uk_grant_flow 把审批再堵死。 */
    @Test
    void grantReusesFailedLogRowInsteadOfInsertingAgain() {
        AiGrantOnApprovalServiceImpl service = newService();
        AiGrantLog failed = new AiGrantLog();
        failed.setId(555L);
        failed.setFlowNo("AI202609230000001");
        failed.setStatus("FAILED");
        when(grantLogMapper.selectOne(any())).thenReturn(failed);
        when(sysUserMapper.selectOne(any())).thenReturn(applier());
        when(employeeAuthMapper.selectOne(any())).thenReturn(null);

        service.grant(buildRequest(), "boss");

        verify(grantLogMapper, never()).insert(any(AiGrantLog.class));
        ArgumentCaptor<AiGrantLog> cap = ArgumentCaptor.forClass(AiGrantLog.class);
        verify(grantLogMapper).updateById(cap.capture());
        assertEquals("GRANTED", cap.getValue().getStatus());
    }

    /** 审批接口只能合并授权键：申请事实（applyReason/requestedModels）不得被改写。 */
    @Test
    void mergeGrantFormDataKeepsApplicationFacts() throws Exception {
        AiGrantOnApprovalServiceImpl service = newService();
        OaRequest req = buildRequest();
        req.setFormData("{\"applyReason\":\"原申請理由\",\"requestedModels\":[11,22]}");

        String merged = service.mergeGrantFormData(req,
                "{\"approvedModels\":[33],\"applyReason\":\"被篡改\",\"approvedQuotaValue\":50}");

        assertNotNull(merged);
        var node = objectMapper.readTree(merged);
        assertEquals("原申請理由", node.get("applyReason").asText());
        assertEquals(2, node.get("requestedModels").size());
        assertEquals(33, node.get("approvedModels").get(0).asInt());
        assertEquals(50, node.get("approvedQuotaValue").asInt());
    }

    /** 只带非白名单键时不得动 form_data */
    @Test
    void mergeGrantFormDataReturnsNullWhenNoGrantKey() {
        AiGrantOnApprovalServiceImpl service = newService();
        OaRequest req = buildRequest();
        req.setFormData("{\"applyReason\":\"原申請理由\"}");
        assertNull(service.mergeGrantFormData(req, "{\"applyReason\":\"被篡改\"}"));
    }

    private SysUser applier() {
        SysUser applicant = new SysUser();
        applicant.setId(7L);
        applicant.setUsername("alice");
        applicant.setName("alice");
        return applicant;
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
