package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.controller.OaRequestController;
import com.mftb.admin.dto.OaApproveDTO;
import com.mftb.admin.dto.OaRejectDTO;
import com.mftb.admin.entity.OaApprovalTask;
import com.mftb.admin.entity.OaRequest;
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
import com.mftb.admin.service.HrPerfCallbackService;
import com.mftb.admin.service.HrLifecycleCallbackService;
import com.mftb.admin.service.SystemAccessGrantService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * OA 流程「撤銷」的访问控制测试。
 * <p>
 * 背景：{@code POST /api/oa/requests/{flowNo}/cancel} 原先挂 {@code @RequirePermission(oa-requests:edit)}，
 * 而门户「系統權限申請」的申请人只有 view（已端到端实测报「没有 [oa-requests] 的[编辑]权限」）——
 * 申请人看得见自己的在途单却撤不回。撤銷自己的申请是资源所有权动作，不是审批人动作，
 * 因此删掉那道菜单权限注解，改为完全依赖服务层的资源归属校验。
 * <p>
 * 注解删了，保护力必须由下面这些用例补回来，所以逐条钉死：
 * <ol>
 *   <li>非申请人、非超管一律拒绝——这是删注解后唯一的真边界；</li>
 *   <li>申请人本人无需任何菜单权限即可撤自己的单；超管可代撤；</li>
 *   <li>已有节点通过 / 流程已审结 都拒绝（别人已承责的单子不能被申请人抽走）；</li>
 *   <li>撤销必须回调业务侧，否则系統權限申請的单据会永远停在审批中；</li>
 *   <li>反射钉死「cancel 无菜单权限注解 + approve/reject 仍有」：例外是有意登记的结果，
 *       既不能被人顺手把注解加回去把门户申请人再堵死，也不能顺手把 approve 的注解删掉。</li>
 * </ol>
 */
class OaRequestCancelAccessTest {

    private static final String FLOW_NO = "XTSQ2026101805";
    private static final String APPLICANT_SIGNATURE = "管理员(MF00001)";

    private OaRequestMapper oaRequestMapper;
    private OaApprovalTaskMapper taskMapper;
    private OperatorResolver operatorResolver;
    private SystemAccessGrantService systemAccessGrantService;
    private OaRequestServiceImpl service;

    @BeforeAll
    static void initTableMetadata() {
        // 成功路径会构造 LambdaUpdateWrapper 去写库，没有实体元数据时报「can not find lambda cache」
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, OaRequest.class);
        TableInfoHelper.initTableInfo(assistant, OaApprovalTask.class);
    }

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        oaRequestMapper = mock(OaRequestMapper.class);
        taskMapper = mock(OaApprovalTaskMapper.class);
        systemAccessGrantService = mock(SystemAccessGrantService.class);
        service = new OaRequestServiceImpl(
                oaRequestMapper, taskMapper, mock(OaProcessMapper.class),
                mock(WorkflowConfigMapper.class), mock(SysUserMapper.class), mock(SysDepartmentMapper.class),
                operatorResolver, mock(ApproverResolverService.class), mock(BizSeqService.class),
                mock(EamPurchaseService.class), mock(EamPurchaseRequestMapper.class), mock(DingTalkService.class),
                mock(DataScopeService.class), mock(AiGrantOnApprovalService.class),
                mock(HrLifecycleCallbackService.class), mock(HrLeaveCallbackService.class),
                mock(com.mftb.admin.service.AttendanceCallbackService.class),
                mock(HrCertificateCallbackService.class), mock(HrPerfCallbackService.class),
                mock(com.mftb.admin.service.RdmIntakeCallbackService.class),
                mock(com.mftb.admin.service.RdmChangeCallbackService.class),
                systemAccessGrantService);
    }

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empId);
        u.setName(name);
        u.setRole("guest");
        return u;
    }

    /** 一条审批中的系統權限申請流程实例 */
    private void stubRequest(String flowStatus, String applicant, OaApprovalTask... tasks) {
        OaRequest request = new OaRequest();
        request.setId(88L);
        request.setFlowNo(FLOW_NO);
        request.setProcessCode("system_access");
        request.setFlowStatus(flowStatus);
        request.setApplicant(applicant);
        when(oaRequestMapper.selectOne(any())).thenReturn(request);
        when(taskMapper.selectList(any())).thenReturn(List.of(tasks));
        when(systemAccessGrantService.isSystemAccessProcess("system_access")).thenReturn(true);
    }

    private static OaApprovalTask task(String status) {
        OaApprovalTask t = new OaApprovalTask();
        t.setTaskStatus(status);
        return t;
    }

    @Test
    @DisplayName("申请人本人撤销自己的在途单：不需要任何菜单权限，且回调业务单据同步状态")
    void applicantCanCancelOwnPendingRequest() {
        SysUser applicant = user(1L, "MF00001", "管理员");
        when(operatorResolver.currentUser()).thenReturn(applicant);
        when(operatorResolver.operatorSignature(applicant)).thenReturn(APPLICANT_SIGNATURE);
        stubRequest("pending", APPLICANT_SIGNATURE, task("pending"));

        assertDoesNotThrow(() -> service.cancel(FLOW_NO));

        verify(oaRequestMapper).update(any(), any());
        // 回调必须发生：否则 biz_system_access_request 会永远停在 pending，门户卡片一直显示「审批中」
        verify(systemAccessGrantService).onFlowCancelled(FLOW_NO);
    }

    @Test
    @DisplayName("非申请人且非超管一律拒绝——这是删掉菜单注解后唯一的真边界")
    void nonApplicantIsRejected() {
        SysUser other = user(9L, "MF00009", "路人");
        when(operatorResolver.currentUser()).thenReturn(other);
        when(operatorResolver.operatorSignature(other)).thenReturn("路人(MF00009)");
        when(operatorResolver.isAdmin(other)).thenReturn(false);
        stubRequest("pending", APPLICANT_SIGNATURE, task("pending"));

        BusinessException error = assertThrows(BusinessException.class, () -> service.cancel(FLOW_NO));

        assertTrue(error.getMessage().contains("僅申請人或管理員可以撤銷流程"), error.getMessage());
        verify(oaRequestMapper, never()).update(any(), any());
        verify(systemAccessGrantService, never()).onFlowCancelled(FLOW_NO);
    }

    @Test
    @DisplayName("超管可代撤（保留原有管理员通道）")
    void superAdminCanCancelForOthers() {
        SysUser admin = user(2L, "MF00032", "系統管理員");
        when(operatorResolver.currentUser()).thenReturn(admin);
        when(operatorResolver.operatorSignature(admin)).thenReturn("系統管理員(MF00032)");
        when(operatorResolver.isAdmin(admin)).thenReturn(true);
        stubRequest("pending", APPLICANT_SIGNATURE, task("pending"));

        assertDoesNotThrow(() -> service.cancel(FLOW_NO));
        verify(oaRequestMapper).update(any(), any());
    }

    @Test
    @DisplayName("已有节点通过 → 拒绝撤销：别人已承责的单子不能被申请人抽走")
    void cancelRejectedWhenSomeNodeApproved() {
        SysUser applicant = user(1L, "MF00001", "管理员");
        when(operatorResolver.currentUser()).thenReturn(applicant);
        when(operatorResolver.operatorSignature(applicant)).thenReturn(APPLICANT_SIGNATURE);
        stubRequest("pending", APPLICANT_SIGNATURE, task("approved"), task("pending"));

        BusinessException error = assertThrows(BusinessException.class, () -> service.cancel(FLOW_NO));
        assertTrue(error.getMessage().contains("已有審批人通過"), error.getMessage());
    }

    @Test
    @DisplayName("流程不在审批中（已通过/已驳回/已撤销）→ 拒绝撤销")
    void cancelRejectedWhenNotPending() {
        SysUser applicant = user(1L, "MF00001", "管理员");
        when(operatorResolver.currentUser()).thenReturn(applicant);
        when(operatorResolver.operatorSignature(applicant)).thenReturn(APPLICANT_SIGNATURE);
        stubRequest("approved", APPLICANT_SIGNATURE, task("approved"));

        BusinessException error = assertThrows(BusinessException.class, () -> service.cancel(FLOW_NO));
        assertTrue(error.getMessage().contains("僅審批中的流程可以撤銷"), error.getMessage());
    }

    @Test
    @DisplayName("撤銷是登记过的例外：不带菜单权限注解；审批通过/驳回仍必须带")
    void cancelExceptionIsRegisteredWhileApproveRejectStayGuarded() throws Exception {
        RequirePermission cancel = OaRequestController.class
                .getMethod("cancel", String.class).getAnnotation(RequirePermission.class);
        assertNull(cancel, "cancel 刻意不带 @RequirePermission（例外已在方法注释登记，保护力由服务层身份校验补上）");

        for (String method : new String[]{"approve", "reject"}) {
            Class<?> payload = "approve".equals(method) ? OaApproveDTO.class : OaRejectDTO.class;
            RequirePermission annotation = OaRequestController.class
                    .getMethod(method, String.class, payload).getAnnotation(RequirePermission.class);
            assertNotNull(annotation, method + " 是审批人动作，必须继续要求 oa-requests:edit");
            assertEquals("oa-requests", annotation.menu(), method + " 的守卫菜单必须是 oa-requests");
            assertEquals("edit", annotation.action(), method + " 必须是 edit 动作");
        }
    }
}
