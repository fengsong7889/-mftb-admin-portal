package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.OaRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.SystemAccessRequest;
import com.mftb.admin.mapper.OaRequestMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.mapper.SystemAccessRequestMapper;
import com.mftb.admin.service.PermissionAuditService;
import com.mftb.admin.service.PermissionService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 系統權限申請「审批即授权」兑现测试。
 * <p>钉死五条安全口径：
 * <ol>
 *   <li>审批人没配授权角色 → 拒绝兑现并抛错（宁可审批整体回滚，也不留「已通过但没权限」）；</li>
 *   <li>内置 admin 角色永不可以通过本流程绑定；</li>
 *   <li>角色没有该系统准入 → 拒绝（绑了也进不去，等于白发一张通过单）；</li>
 *   <li>兑现成功 → 追加 function_roles（不覆盖既有角色）+ 落授权审计 + 刷新权限缓存使权限立即生效；</li>
 *   <li>重复回调幂等：已 granted 的单子不再动用户与审计。</li>
 * </ol>
 */
class SystemAccessGrantServiceImplTest {

    private static final String FLOW_NO = "XTSQ2026101801";
    private static final String SYSTEM_CODE = "eam";
    private static final long ROLE_ID = 7L;
    private static final long USER_ID = 21L;
    private static final long REQUEST_ID = 11L;

    private SystemAccessRequestMapper requestMapper;
    private OaRequestMapper oaRequestMapper;
    private SysUserMapper sysUserMapper;
    private JdbcTemplate jdbcTemplate;
    private PermissionService permissionService;
    private PermissionAuditService permissionAuditService;
    private SystemAccessGrantServiceImpl service;

    @BeforeAll
    static void initTableMetadata() {
        // LambdaUpdateWrapper 的列名解析依赖 TableInfo 缓存，纯 Mockito 测试必须自己预建
        for (Class<?> entity : List.of(SystemAccessRequest.class, OaRequest.class, SysUser.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    @BeforeEach
    void setUp() {
        requestMapper = mock(SystemAccessRequestMapper.class);
        oaRequestMapper = mock(OaRequestMapper.class);
        sysUserMapper = mock(SysUserMapper.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        permissionService = mock(PermissionService.class);
        permissionAuditService = mock(PermissionAuditService.class);
        service = new SystemAccessGrantServiceImpl(requestMapper, oaRequestMapper, sysUserMapper,
                jdbcTemplate, permissionService, permissionAuditService);

        when(requestMapper.selectOne(any())).thenReturn(pendingRequest());
        when(oaRequestMapper.selectOne(any())).thenReturn(oaRequest(grantPayload(ROLE_ID)));
        when(sysUserMapper.selectById(USER_ID)).thenReturn(applicant("[3]"));
        stubRole(ROLE_ID, "asset_admin", "資產管理員");
        stubRoleSystemAccess(ROLE_ID, 1);
    }

    /* ==================== 兑现成功 ==================== */

    @Test
    @DisplayName("兑现成功：追加角色（保留既有角色）+ 落审计 + 刷新权限缓存 + 单据置 granted")
    void grantBindsRoleAndRefreshesPermission() {
        service.onFlowApproved(FLOW_NO, "李四(MF00002)");

        // 只更新 function_roles 一列：既有角色 3 必须保留，新角色 7 追加在后
        ArgumentCaptor<LambdaUpdateWrapper<SysUser>> userCaptor = lambdaUpdateCaptor();
        verify(sysUserMapper).update(isNull(), userCaptor.capture());
        LambdaUpdateWrapper<SysUser> userWrapper = userCaptor.getValue();
        userWrapper.getSqlSegment();
        assertTrue(userWrapper.getParamNameValuePairs().containsValue("[3,7]"),
                "function_roles 必须是既有角色 + 新角色的并集，实际: " + userWrapper.getParamNameValuePairs());

        // 单据状态与兑现结果写在同一条更新里
        ArgumentCaptor<LambdaUpdateWrapper<SystemAccessRequest>> reqCaptor = lambdaUpdateCaptor();
        verify(requestMapper).update(isNull(), reqCaptor.capture());
        LambdaUpdateWrapper<SystemAccessRequest> reqWrapper = reqCaptor.getValue();
        reqWrapper.getSqlSegment();
        assertTrue(reqWrapper.getParamNameValuePairs().containsValue("granted"));
        assertTrue(reqWrapper.getParamNameValuePairs().containsValue("approved"));
        assertTrue(reqWrapper.getParamNameValuePairs().containsValue("資產管理員"));

        // 授权变更必须可追溯（角色绑定审计），且权限缓存被刷新（否则申请人要等 5 分钟才生效）
        verify(permissionAuditService).record(eq(PermissionAuditService.TARGET_ROLE), eq(ROLE_ID),
                eq("資產管理員"), eq(SYSTEM_CODE), eq(PermissionAuditService.CHANGE_BIND), any(), any());
        verify(permissionService).evictAll();
    }

    @Test
    @DisplayName("申请人已持有该角色时不重复绑定，但仍记审计并置为已兑现")
    void grantIsNoopWhenRoleAlreadyBound() {
        when(sysUserMapper.selectById(USER_ID)).thenReturn(applicant("[3,7]"));

        service.onFlowApproved(FLOW_NO, "李四(MF00002)");

        verify(sysUserMapper, never()).update(any(), any());
        verify(permissionAuditService).record(eq(PermissionAuditService.TARGET_ROLE), eq(ROLE_ID),
                anyString(), eq(SYSTEM_CODE), eq(PermissionAuditService.CHANGE_BIND), any(), any());
        verify(requestMapper).update(isNull(), any());
    }

    /* ==================== fail-closed ==================== */

    @Test
    @DisplayName("审批人未配置授权角色：拒绝兑现，不动用户与缓存")
    void missingGrantConfigIsRejected() {
        when(oaRequestMapper.selectOne(any())).thenReturn(oaRequest("{\"systemCode\":\"eam\"}"));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.onFlowApproved(FLOW_NO, "李四(MF00002)"));

        assertTrue(error.getMessage().contains("審批未配置授權角色"), error.getMessage());
        verify(sysUserMapper, never()).update(any(), any());
        verifyNoInteractions(permissionService);
    }

    @Test
    @DisplayName("内置 admin 角色不得通过本流程绑定")
    void superAdminRoleIsNeverGrantable() {
        stubRole(ROLE_ID, "admin", "超級管理員");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.onFlowApproved(FLOW_NO, "李四(MF00002)"));

        assertTrue(error.getMessage().contains("admin"), error.getMessage());
        verify(sysUserMapper, never()).update(any(), any());
        verifyNoInteractions(permissionService);
    }

    @Test
    @DisplayName("角色未取得该系统准入：拒绝兑现（绑了也进不去系统）")
    void roleWithoutSystemAccessIsRejected() {
        stubRoleSystemAccess(ROLE_ID, 0);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.onFlowApproved(FLOW_NO, "李四(MF00002)"));

        assertTrue(error.getMessage().contains("尚未獲得該系統的准入"), error.getMessage());
        assertTrue(error.getMessage().contains("權限管理系統"), "错误必须告诉审批人下一步去哪配");
        verify(sysUserMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("角色不存在或已停用：拒绝兑现")
    void disabledRoleIsRejected() {
        when(jdbcTemplate.queryForList(contains("FROM sys_role"), eq(ROLE_ID))).thenReturn(List.of());

        assertThrows(BusinessException.class, () -> service.onFlowApproved(FLOW_NO, "李四(MF00002)"));
        verify(sysUserMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("幂等：已兑现的单子重复回调不再动用户与审计")
    void repeatedCallbackIsIdempotent() {
        SystemAccessRequest granted = pendingRequest();
        granted.setGrantStatus("granted");
        when(requestMapper.selectOne(any())).thenReturn(granted);

        service.onFlowApproved(FLOW_NO, "李四(MF00002)");

        verify(sysUserMapper, never()).update(any(), any());
        verifyNoInteractions(permissionAuditService, permissionService);
    }

    @Test
    @DisplayName("申请单缺失时抛错：不允许把授权兑现到查无此单的流程上")
    void missingRequestRowIsRejected() {
        when(requestMapper.selectOne(any())).thenReturn(null);

        assertThrows(BusinessException.class, () -> service.onFlowApproved(FLOW_NO, "李四(MF00002)"));
        verify(sysUserMapper, never()).update(any(), any());
    }

    /* ==================== 节点审批时的配置校验 ==================== */

    @Test
    @DisplayName("节点审批：授权配置合法则合并进 form_data，且角色名以数据库为准")
    void mergeGrantConfigNormalizesRoleName() {
        OaRequest request = oaRequest("{\"systemCode\":\"eam\",\"reason\":\"需要核对物资\"}");

        String merged = service.mergeGrantConfig(request,
                "{\"approvedGrant\":{\"targetType\":\"role\",\"targetId\":7,\"targetName\":\"前端传的错误名字\"}}");

        assertTrue(merged.contains("\"targetName\":\"資產管理員\""), "角色名必须取数据库快照: " + merged);
        assertTrue(merged.contains("需要核对物资"), "申请说明必须原样保留: " + merged);
        assertTrue(merged.contains("\"systemCode\":\"eam\""));
    }

    @Test
    @DisplayName("节点审批：角色不可用时当场拒绝，不等终审兑现才失败")
    void mergeGrantConfigRejectsUnusableRole() {
        stubRoleSystemAccess(ROLE_ID, 0);
        OaRequest request = oaRequest("{\"systemCode\":\"eam\"}");

        assertThrows(BusinessException.class, () -> service.mergeGrantConfig(request, grantPayload(ROLE_ID)));
    }

    @Test
    @DisplayName("节点审批未携带授权配置：返回 null，调用方不改写 form_data")
    void mergeGrantConfigWithoutGrantReturnsNull() {
        OaRequest request = oaRequest("{\"systemCode\":\"eam\"}");

        assertNull(service.mergeGrantConfig(request, null));
        assertNull(service.mergeGrantConfig(request, "{\"comment\":\"同意\"}"));
    }

    /* ==================== 驳回 / 撤销 ==================== */

    @Test
    @DisplayName("驳回：单据置 rejected 并记理由，不兑现任何授权")
    void rejectSyncsStatusWithoutGrant() {
        service.onFlowRejected(FLOW_NO, "职责不匹配");

        ArgumentCaptor<LambdaUpdateWrapper<SystemAccessRequest>> captor = lambdaUpdateCaptor();
        verify(requestMapper).update(isNull(), captor.capture());
        LambdaUpdateWrapper<SystemAccessRequest> wrapper = captor.getValue();
        wrapper.getSqlSegment();
        assertTrue(wrapper.getParamNameValuePairs().containsValue("rejected"));
        assertTrue(wrapper.getParamNameValuePairs().containsValue("职责不匹配"));
        verify(sysUserMapper, never()).update(any(), any());
        verifyNoInteractions(permissionService);
    }

    @Test
    @DisplayName("撤销：单据置 cancelled，不兑现任何授权")
    void cancelSyncsStatus() {
        service.onFlowCancelled(FLOW_NO);

        ArgumentCaptor<LambdaUpdateWrapper<SystemAccessRequest>> captor = lambdaUpdateCaptor();
        verify(requestMapper).update(isNull(), captor.capture());
        LambdaUpdateWrapper<SystemAccessRequest> wrapper = captor.getValue();
        wrapper.getSqlSegment();
        assertTrue(wrapper.getParamNameValuePairs().containsValue("cancelled"));
        verify(sysUserMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("已兑现的单子收到驳回回调：保留授权不动（数据异常只告警，不能悄悄撤权）")
    void grantedRequestKeepsAuthorizationOnLateReject() {
        SystemAccessRequest granted = pendingRequest();
        granted.setGrantStatus("granted");
        when(requestMapper.selectOne(any())).thenReturn(granted);

        service.onFlowRejected(FLOW_NO, "迟到的驳回");

        verify(requestMapper, never()).update(any(), any());
        verify(sysUserMapper, never()).update(any(), any());
    }

    /* ==================== 到期自动回收 ==================== */

    @Test
    @DisplayName("到期回收：从 function_roles 里移除本单绑上的角色 + 落 REVOKE 审计 + 刷新缓存")
    void expiredGrantIsUnboundAndAudited() {
        when(requestMapper.selectById(REQUEST_ID)).thenReturn(expiredGrant());
        when(requestMapper.selectCount(any())).thenReturn(0L);
        when(requestMapper.update(isNull(), any())).thenReturn(1);
        when(sysUserMapper.selectById(USER_ID)).thenReturn(applicant("[3," + ROLE_ID + "]"));

        assertTrue(service.expireGrant(REQUEST_ID));

        // 只移除本单那一个角色：与管理员从别处绑上的角色 3 共存时不得误删
        ArgumentCaptor<LambdaUpdateWrapper<SysUser>> userCaptor = lambdaUpdateCaptor();
        verify(sysUserMapper).update(isNull(), userCaptor.capture());
        LambdaUpdateWrapper<SysUser> userWrapper = userCaptor.getValue();
        userWrapper.getSqlSegment();
        assertTrue(userWrapper.getParamNameValuePairs().containsValue("[3]"),
                "回收后应只剩原有角色 3，实际: " + userWrapper.getParamNameValuePairs());
        verify(permissionAuditService).record(eq(PermissionAuditService.TARGET_ROLE), eq(ROLE_ID),
                eq("資產管理員"), eq(SYSTEM_CODE), eq(PermissionAuditService.CHANGE_REVOKE), any(), any(),
                eq("system-expiry"));
        verify(permissionService).evictAll();
    }

    @Test
    @DisplayName("回收资格只认 grant_newly_bound=1：申请人本来就有同角色的单不碰")
    void roleAlreadyHeldBeforeGrantIsNeverReclaimed() {
        SystemAccessRequest entity = expiredGrant();
        entity.setGrantNewlyBound(0);
        when(requestMapper.selectById(REQUEST_ID)).thenReturn(entity);

        assertFalse(service.expireGrant(REQUEST_ID));

        // 关键一条：不能把管理员从别处给的同一角色用一张到期单收掉
        verifyNoInteractions(sysUserMapper);
        verify(requestMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("到期日当天仍可用车：只有 strictly 过期才回收")
    void grantIsNotReclaimedOnItsOwnExpiryDay() {
        SystemAccessRequest entity = expiredGrant();
        entity.setDurationUntil(java.time.LocalDate.now());
        when(requestMapper.selectById(REQUEST_ID)).thenReturn(entity);

        assertFalse(service.expireGrant(REQUEST_ID));
        verify(requestMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("长期授权永不回收；已回收/已豁免的不再重复处理")
    void permanentAndAlreadySettledGrantsAreSkipped() {
        SystemAccessRequest permanent = expiredGrant();
        permanent.setDurationType("permanent");
        permanent.setDurationUntil(null);
        when(requestMapper.selectById(REQUEST_ID)).thenReturn(permanent);
        assertFalse(service.expireGrant(REQUEST_ID));

        SystemAccessRequest revoked = expiredGrant();
        revoked.setRevokeStatus("revoked");
        when(requestMapper.selectById(REQUEST_ID)).thenReturn(revoked);
        assertFalse(service.expireGrant(REQUEST_ID));

        verify(requestMapper, never()).update(any(), any());
        verifyNoInteractions(sysUserMapper);
    }

    @Test
    @DisplayName("同一角色还有其他未过期授权 → 标 kept 不抽走权限，且不再重复扫")
    void otherCoveringGrantKeepsTheRoleBound() {
        when(requestMapper.selectById(REQUEST_ID)).thenReturn(expiredGrant());
        when(requestMapper.selectCount(any())).thenReturn(1L);
        when(requestMapper.update(isNull(), any())).thenReturn(1);

        assertFalse(service.expireGrant(REQUEST_ID));

        ArgumentCaptor<LambdaUpdateWrapper<SystemAccessRequest>> captor = lambdaUpdateCaptor();
        verify(requestMapper).update(isNull(), captor.capture());
        LambdaUpdateWrapper<SystemAccessRequest> wrapper = captor.getValue();
        wrapper.getSqlSegment();
        assertTrue(wrapper.getParamNameValuePairs().containsValue("kept"),
                "应标成 kept，实际: " + wrapper.getParamNameValuePairs());
        verifyNoInteractions(sysUserMapper);
        verify(permissionService, never()).evictAll();
    }

    @Test
    @DisplayName("多实例并发：条件更新没抢到认领就不解绑（不会回收两次、不会写两份审计）")
    void lostClaimSkipsUnbind() {
        when(requestMapper.selectById(REQUEST_ID)).thenReturn(expiredGrant());
        when(requestMapper.selectCount(any())).thenReturn(0L);
        when(requestMapper.update(isNull(), any())).thenReturn(0);

        assertFalse(service.expireGrant(REQUEST_ID));
        verifyNoInteractions(sysUserMapper);
    }

    @Test
    @DisplayName("认领后回滚不等于已回收：本单未处理完时不能提前刷新权限缓存")
    void unbindFailureLeavesNothingHalfDone() {
        when(requestMapper.selectById(REQUEST_ID)).thenReturn(expiredGrant());
        when(requestMapper.selectCount(any())).thenReturn(0L);
        when(requestMapper.update(isNull(), any())).thenReturn(1);
        when(sysUserMapper.selectById(USER_ID)).thenReturn(applicant("[3," + ROLE_ID + "]"));
        org.mockito.Mockito.doThrow(new IllegalStateException("audit down"))
                .when(permissionAuditService)
                .record(any(), any(), any(), any(), any(), any(), any(), any());

        // 抛错 → @Transactional 回滚认领，状态回到 none；下一轮重试，不会出现「标了已回收但权限还在身上」
        assertThrows(IllegalStateException.class, () -> service.expireGrant(REQUEST_ID));
    }

    @Test
    @DisplayName("申请人账号已不存在：只标回收不解绑（权限随账号一起没了，不是漏收）")
    void missingApplicantIsMarkedRevokedWithoutUnbind() {
        when(requestMapper.selectById(REQUEST_ID)).thenReturn(expiredGrant());
        when(requestMapper.selectCount(any())).thenReturn(0L);
        when(requestMapper.update(isNull(), any())).thenReturn(1);
        when(sysUserMapper.selectById(USER_ID)).thenReturn(null);

        assertFalse(service.expireGrant(REQUEST_ID));
        verify(requestMapper).update(isNull(), any());
        verify(sysUserMapper, never()).update(any(), any());
    }

    @Test
    @DisplayName("兑现时把回收资格 grant_newly_bound 一起写下（新绑=1）")
    void grantRecordsNewlyBoundFlag() {
        service.onFlowApproved(FLOW_NO, "李四(MF00002)");

        ArgumentCaptor<LambdaUpdateWrapper<SystemAccessRequest>> captor = lambdaUpdateCaptor();
        verify(requestMapper).update(isNull(), captor.capture());
        LambdaUpdateWrapper<SystemAccessRequest> wrapper = captor.getValue();
        wrapper.getSqlSegment();
        assertTrue(wrapper.getParamNameValuePairs().containsValue(1),
                "本单真的新绑了角色，grant_newly_bound 必须为 1");
        assertTrue(wrapper.getParamNameValuePairs().containsValue("none"),
                "revoke_status 初始必须是 none（否则作业永远扫不到）");
    }

    /* ==================== 夹具 ==================== */

    /** 一张「已兑现且已过期」的授权单：回收作业的正常候选 */
    private static SystemAccessRequest expiredGrant() {
        SystemAccessRequest entity = new SystemAccessRequest();
        entity.setId(REQUEST_ID);
        entity.setFlowNo(FLOW_NO);
        entity.setSystemCode(SYSTEM_CODE);
        entity.setSystemName("物資管理系統");
        entity.setUserId(USER_ID);
        entity.setStatus("approved");
        entity.setGrantStatus("granted");
        entity.setGrantTargetType("role");
        entity.setGrantTargetId(ROLE_ID);
        entity.setGrantTargetName("資產管理員");
        entity.setGrantNewlyBound(1);
        entity.setRevokeStatus("none");
        entity.setDurationType("until");
        // 到期日已过（昨天）：作业只在 strictly 过期后才动手
        entity.setDurationUntil(java.time.LocalDate.now().minusDays(1));
        return entity;
    }

    private static SystemAccessRequest pendingRequest() {
        SystemAccessRequest entity = new SystemAccessRequest();
        entity.setId(11L);
        entity.setFlowNo(FLOW_NO);
        entity.setSystemCode(SYSTEM_CODE);
        entity.setSystemName("物資管理系統");
        entity.setUserId(USER_ID);
        entity.setApplicantName("張三");
        entity.setStatus("pending");
        entity.setGrantStatus("none");
        entity.setRequestedMenus("[{\"menuKey\":\"asset-list\",\"name\":\"資產台账\"}]");
        entity.setReason("需要核对门店活动物资");
        return entity;
    }

    private static OaRequest oaRequest(String formData) {
        OaRequest request = new OaRequest();
        request.setId(99L);
        request.setFlowNo(FLOW_NO);
        request.setProcessCode("system_access");
        request.setFormData(formData);
        request.setFlowStatus("pending");
        return request;
    }

    private static SysUser applicant(String functionRoles) {
        SysUser user = new SysUser();
        user.setId(USER_ID);
        user.setUsername("zhangsan");
        user.setName("張三");
        user.setEmpId("MF00021");
        user.setFunctionRoles(functionRoles);
        return user;
    }

    private static String grantPayload(long roleId) {
        return "{\"approvedGrant\":{\"targetType\":\"role\",\"targetId\":" + roleId + "}}";
    }

    private void stubRole(long roleId, String code, String name) {
        when(jdbcTemplate.queryForList(contains("FROM sys_role"), eq(roleId)))
                .thenReturn(List.of(Map.of("id", roleId, "code", code, "name", name)));
    }

    private void stubRoleSystemAccess(long roleId, int count) {
        when(jdbcTemplate.queryForObject(contains("sys_role_system"), eq(Integer.class), eq(roleId), eq(SYSTEM_CODE)))
                .thenReturn(count);
    }

    @SuppressWarnings("unchecked")
    private static <T> ArgumentCaptor<LambdaUpdateWrapper<T>> lambdaUpdateCaptor() {
        return ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
    }
}
