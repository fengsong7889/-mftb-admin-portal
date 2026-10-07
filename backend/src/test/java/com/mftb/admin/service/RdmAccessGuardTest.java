package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmReview;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * RDM 需求级访问守卫测试（阶段 2A 的安全边界）。
 * <p>锁死四条口径，防止日后又回到「只按菜单权放行 + 按 id 取数」：
 * <ol>
 *   <li>菜单权限不等于资源权限：与需求无关的人不能读也不能改；</li>
 *   <li>看得到不等于改得了：提出人可读，但交付物（PRD/任务/评审/变更）归产研侧角色；</li>
 *   <li>业务结论只能由指定的人出：代验收、代签评审结论一律拒；</li>
 *   <li>一人多角色取并集，不能按写入顺序只认第一个。</li>
 * </ol>
 */
class RdmAccessGuardTest {

    private OperatorResolver operatorResolver;
    private PermissionService permissionService;
    private RdmRequirementMapper requirementMapper;
    private RdmRequirementRoleMapper roleMapper;
    private RdmAccessGuard guard;

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        roleMapper = mock(RdmRequirementRoleMapper.class);
        when(roleMapper.selectList(any())).thenReturn(List.of());
        when(roleMapper.selectCount(any())).thenReturn(0L);
        // 按 id 反查必须能拿到需求本体：否则「需求不存在」会伪装成「无权限」，测试就测不到真实分支
        when(requirementMapper.selectById(100L)).thenReturn(requirement100());
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        guard = new RdmAccessGuard(operatorResolver, permissionService, requirementMapper, roleMapper);
    }

    private static SysUser user(long id) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId("MF" + id);
        u.setName("員工" + id);
        return u;
    }

    /** 需求 100：提出人 11、产品经理 21、验收人 31、研发负责人 41、技术负责人 51 */
    private static RdmRequirement requirement100() {
        RdmRequirement req = new RdmRequirement();
        req.setId(100L);
        req.setReqNo("XQ202610060001");
        req.setStatus(RdmConstants.STATUS_DEVELOPING);
        req.setSubmitterUserId(11L);
        req.setAssigneePmUserId(21L);
        req.setAcceptorUserId(31L);
        req.setDevOwnerUserId(41L);
        req.setDispatcherUserId(51L);
        return req;
    }

    private static RdmRequirementRole role(long userId, String roleCode) {
        RdmRequirementRole r = new RdmRequirementRole();
        r.setReqId(100L);
        r.setUserId(userId);
        r.setRoleCode(roleCode);
        r.setIsActive(1);
        return r;
    }

    /* ==================== 读守卫 ==================== */

    @Test
    @DisplayName("与需求无关的人即使有菜单权也读不到交付子资源")
    void strangerCannotReadSubResources() {
        // 他连 rdm-requirement:view 都有（Controller 层已放行），这里要拦住的是资源归属
        BusinessException ex = assertThrows(BusinessException.class,
                () -> guard.requireVisible(100L, "查看 PRD"));
        assertTrue(ex.getMessage().contains("查看 PRD"), ex.getMessage());
    }

    @Test
    @DisplayName("提出人可读自己提的需求")
    void submitterCanRead() {
        assertDoesNotThrow(() -> guard.requireVisible(requirement100(), user(11L), "查看交付過程"));
    }

    @Test
    @DisplayName("技术负责人（分配侧 view）可跨部门查看")
    void intakeViewerSeesAll() {
        SysUser techLead = user(60L);
        when(permissionService.hasPermission(techLead, RdmConstants.MENU_INTAKE, "view")).thenReturn(true);
        assertDoesNotThrow(() -> guard.requireVisible(requirement100(), techLead, "查看詳情"));
    }

    /* ==================== 交付子资源写守卫 ==================== */

    @Test
    @DisplayName("提出人不能编辑交付物：可读不等于可改")
    void submitterCannotWriteDelivery() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> guard.requireDeliveryWriter(requirement100(), user(11L), "編輯 PRD"));
        assertTrue(ex.getMessage().contains("編輯 PRD"), ex.getMessage());
    }

    @Test
    @DisplayName("产品经理可编辑交付物")
    void pmCanWriteDelivery() {
        assertDoesNotThrow(() -> guard.requireDeliveryWriter(requirement100(), user(21L), "編寫 PRD"));
    }

    @Test
    @DisplayName("仅凭菜单编辑权、与需求无关的人不能改别人的 PRD")
    void menuEditAloneDoesNotOpenOthersDelivery() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> guard.requireDeliveryWriter(100L, "編輯 PRD"));
        assertTrue(ex.getMessage().contains("您與該需求無關"), ex.getMessage());
    }

    @Test
    @DisplayName("存量单据没有角色记录时，按主表字段兜底判定角色")
    void inferredRolesFromMainFields() {
        // 研发负责人只在主表字段上、角色表没有行：他仍应有产研侧写权限
        assertDoesNotThrow(() -> guard.requireDeliveryWriter(requirement100(), user(41L), "維護任務"));
    }

    /* ==================== 多角色并集 ==================== */

    @Test
    @DisplayName("一人多角色返回并集，不按写入顺序只认第一个")
    void activeRolesReturnsAllRoles() {
        SysUser dual = user(11L);
        when(roleMapper.selectList(any())).thenReturn(List.of(
                role(11L, RdmConstants.ROLE_SUBMITTER),
                role(11L, RdmConstants.ROLE_ACCEPTOR)));
        assertEquals(2, guard.activeRoles(100L, dual).size());
        assertTrue(guard.activeRoles(100L, dual).contains(RdmConstants.ROLE_ACCEPTOR));
    }

    @Test
    @DisplayName("提出人兼测试角色时仍可编辑交付物（角色并集不被顺序影响）")
    void multiRoleKeepsDeliveryCapability() {
        SysUser dual = user(11L);
        when(roleMapper.selectList(any())).thenReturn(List.of(
                role(11L, RdmConstants.ROLE_SUBMITTER),
                role(11L, RdmConstants.ROLE_QA)));
        assertDoesNotThrow(() -> guard.requireDeliveryWriter(requirement100(), dual, "維護任務"));
    }

    /* ==================== 业务验收人 ==================== */

    @Test
    @DisplayName("非指定验收人不能提交验收结论")
    void onlyDesignatedAcceptorCanSubmit() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> guard.requireAcceptor(requirement100(), user(21L), "提交驗收結論"));
        assertTrue(ex.getMessage().contains("驗收人"), ex.getMessage());
    }

    @Test
    @DisplayName("指定验收人可以提交验收结论")
    void designatedAcceptorPasses() {
        assertDoesNotThrow(() -> guard.requireAcceptor(requirement100(), user(31L), "提交驗收結論"));
    }

    @Test
    @DisplayName("验收人缺省时由提出人验收")
    void submitterIsAcceptorWhenNotDesignated() {
        RdmRequirement req = requirement100();
        req.setAcceptorUserId(null);
        assertDoesNotThrow(() -> guard.requireAcceptor(req, user(11L), "提交驗收結論"));
    }

    /* ==================== 任务与评审 ==================== */

    @Test
    @DisplayName("任务负责人本人可上报进度")
    void taskOwnerCanReport() {
        SysUser owner = user(42L);
        when(operatorResolver.currentUser()).thenReturn(owner);
        assertDoesNotThrow(() -> guard.requireTaskOperator(100L, 42L, "上報任務進度"));
    }

    @Test
    @DisplayName("非负责人且非产品/研发负责人不能替别人上报进度")
    void otherRoleCannotReportTask() {
        SysUser acceptor = user(31L);
        when(operatorResolver.currentUser()).thenReturn(acceptor);
        assertThrows(BusinessException.class, () -> guard.requireTaskOperator(100L, 42L, "上報任務進度"));
    }

    @Test
    @DisplayName("负责人字段为空时由产品/研发负责人兜底，而不是放开给所有人")
    void emptyOwnerFallsBackToLeadRoles() {
        SysUser pm = user(21L);
        when(operatorResolver.currentUser()).thenReturn(pm);
        assertDoesNotThrow(() -> guard.requireTaskOperator(100L, null, "上報任務進度"));

        SysUser acceptor = user(31L);
        when(operatorResolver.currentUser()).thenReturn(acceptor);
        assertThrows(BusinessException.class, () -> guard.requireTaskOperator(100L, null, "上報任務進度"));
    }

    @Test
    @DisplayName("评审结论可由发起时指定的参与人录入")
    void reviewDecisionAcceptsParticipant() {
        SysUser participant = user(88L);
        when(operatorResolver.currentUser()).thenReturn(participant);
        RdmReview review = new RdmReview();
        review.setReqId(100L);
        review.setParticipantIds("11,88,42");
        assertDoesNotThrow(() -> guard.requireReviewParticipant(review, "録入評審結論"));
    }

    @Test
    @DisplayName("非参与人且无产研角色的人不能给别人的评审签字")
    void reviewDecisionRejectsOutsider() {
        SysUser outsider = user(99L);
        when(operatorResolver.currentUser()).thenReturn(outsider);
        RdmReview review = new RdmReview();
        review.setReqId(100L);
        review.setParticipantIds("11,88");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> guard.requireReviewParticipant(review, "録入評審結論"));
        assertTrue(ex.getMessage().contains("評審"), ex.getMessage());
    }
}
