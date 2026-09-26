package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.OaApprovalTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamPurchaseRequestMapper;
import com.mftb.admin.mapper.OaApprovalTaskMapper;
import com.mftb.admin.mapper.OaProcessMapper;
import com.mftb.admin.mapper.OaRequestMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.mapper.WorkflowConfigMapper;
import com.mftb.admin.service.AiGrantOnApprovalService;
import com.mftb.admin.service.ApproverResolverService;
import com.mftb.admin.service.DataScopeService;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.EamPurchaseService;
import com.mftb.admin.service.HrCertificateCallbackService;
import com.mftb.admin.service.HrLeaveCallbackService;
import com.mftb.admin.service.HrLifecycleCallbackService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * OA 审批节点审批人判定测试（fail-closed 口径）。
 * <p>
 * 旧实现是 fail-open：节点 approver 为 null 时直接跳过校验，任何拿到入口的人都能通过或驳回；
 * 且用整串 contains 判断身份，工号互为前缀（MF0002 / MF00024）会误放行。
 * 本用例锁死两条：未配置审批人必须拒绝、身份必须逐个精确匹配。
 */
class OaRequestApproverGuardTest {

    private OperatorResolver operatorResolver;
    private OaRequestServiceImpl service;

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        service = new OaRequestServiceImpl(
                mock(OaRequestMapper.class), mock(OaApprovalTaskMapper.class), mock(OaProcessMapper.class),
                mock(WorkflowConfigMapper.class), mock(SysUserMapper.class), mock(SysDepartmentMapper.class),
                operatorResolver, mock(ApproverResolverService.class), mock(BizSeqService.class),
                mock(EamPurchaseService.class), mock(EamPurchaseRequestMapper.class), mock(DingTalkService.class),
                mock(DataScopeService.class), mock(AiGrantOnApprovalService.class),
                mock(HrLifecycleCallbackService.class), mock(HrLeaveCallbackService.class),
                mock(HrCertificateCallbackService.class));
    }

    private static SysUser user(long id, String empId, String name, String role) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empId);
        u.setName(name);
        u.setRole(role);
        return u;
    }

    private static OaApprovalTask task(String approver) {
        OaApprovalTask t = new OaApprovalTask();
        t.setId(1L);
        t.setNodeName("人事審批");
        t.setApprover(approver);
        return t;
    }

    /** OperatorResolver.operatorSignature 是真方法，mock 后需按实体口径打桩：姓名(工号) */
    private void stubSignature(SysUser user) {
        when(operatorResolver.operatorSignature(user)).thenReturn(user.getName() + "(" + user.getEmpId() + ")");
    }

    @Test
    @DisplayName("节点未配置审批人时拒绝，而不是放行")
    void nullApproverIsRejected() {
        SysUser zhang = user(24L, "MF00024", "張三", "user");
        stubSignature(zhang);
        when(operatorResolver.isAdmin(zhang)).thenReturn(false);

        for (String missing : new String[]{null, "", "   "}) {
            BusinessException e = assertThrows(BusinessException.class,
                    () -> service.requireNodeApprover(task(missing), zhang, "審批"));
            assertTrue(e.getMessage().contains("未配置審批人"),
                    "提示信息应指向流程配置缺失，实际: " + e.getMessage());
        }
    }

    @Test
    @DisplayName("非节点审批人拒绝；节点审批人精确匹配放行")
    void onlyNamedApproverPasses() {
        SysUser leader = user(24L, "MF00024", "張三", "user");
        SysUser stranger = user(25L, "MF00030", "李四", "user");
        stubSignature(leader);
        stubSignature(stranger);
        when(operatorResolver.isAdmin(leader)).thenReturn(false);
        when(operatorResolver.isAdmin(stranger)).thenReturn(false);

        OaApprovalTask node = task("張三(MF00024)");
        assertDoesNotThrow(() -> service.requireNodeApprover(node, leader, "審批"));
        assertThrows(BusinessException.class, () -> service.requireNodeApprover(node, stranger, "審批"));
    }

    @Test
    @DisplayName("工号前缀互为包含不得误放行（旧整串 contains 判定的漏洞）")
    void empIdPrefixDoesNotMatch() {
        SysUser shortEmp = user(25L, "MF0002", "小明", "user");
        stubSignature(shortEmp);
        when(operatorResolver.isAdmin(shortEmp)).thenReturn(false);

        // 节点只授权给 MF00024；"MF00024".contains("MF0002") 为真，但两人不是同一人
        assertThrows(BusinessException.class,
                () -> service.requireNodeApprover(task("張三(MF00024)"), shortEmp, "駁回"));
    }

    @Test
    @DisplayName("历史配置只存姓名或只存工号时仍可匹配，多人节点逐个比对")
    void legacyNameOrEmpOnlyApproverMatches() {
        SysUser leader = user(24L, "MF00024", "張三", "user");
        stubSignature(leader);
        when(operatorResolver.isAdmin(leader)).thenReturn(false);

        assertDoesNotThrow(() -> service.requireNodeApprover(task("張三"), leader, "審批"));
        assertDoesNotThrow(() -> service.requireNodeApprover(task("MF00024"), leader, "審批"));
        assertDoesNotThrow(() -> service.requireNodeApprover(
                task("李四(MF00030), 張三(MF00024)"), leader, "審批"));
    }

    @Test
    @DisplayName("管理员兜底可审批任意节点（含未配置审批人的节点）")
    void adminBypassesGuard() {
        SysUser admin = user(1L, "MF00001", "管理員", "admin");
        when(operatorResolver.isAdmin(admin)).thenReturn(true);

        assertDoesNotThrow(() -> service.requireNodeApprover(task(null), admin, "審批"));
        assertDoesNotThrow(() -> service.requireNodeApprover(task("張三(MF00024)"), admin, "駁回"));
    }

    @Test
    @DisplayName("未登录状态直接拒绝，避免匿名通过")
    void anonymousIsRejected() {
        when(operatorResolver.isAdmin(null)).thenReturn(false);

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.requireNodeApprover(task("張三(MF00024)"), null, "審批"));
        assertTrue(e.getMessage().contains("重新登錄"), "实际: " + e.getMessage());
    }
}
