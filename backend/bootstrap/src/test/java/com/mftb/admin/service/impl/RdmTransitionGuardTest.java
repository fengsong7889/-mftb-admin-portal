package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmAcceptanceMapper;
import com.mftb.admin.mapper.RdmAttachmentMapper;
import com.mftb.admin.mapper.RdmCommentMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmRequirementTargetMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * RDM 状态流转守卫测试（角色 + 必填字段）。
 * <p>状态机的可执行性只认数据库配置，本用例锁死三条口径：
 * <ol>
 *   <li>非该环节允许角色的人不能推进（fail-closed，超管例外）；</li>
 *   <li>配置了必填字段而前端未填时必须拒绝，且提示中文字段名而非英文 key；</li>
 *   <li>技术负责人可用「持有需求池编辑权」兜底执行分配动作。</li>
 * </ol>
 */
class RdmTransitionGuardTest {

    private OperatorResolver operatorResolver;
    private PermissionService permissionService;
    private RdmRequirementMapper requirementMapper;
    private com.mftb.admin.mapper.RdmRequirementRoleMapper roleMapper;
    private RdmAccessGuard accessGuard;
    private RdmConfigService configService;
    private RdmNotifyService notifyService;
    private RdmRequirementServiceImpl service;

    /**
     * 完整流转链会用方法引用构造 LambdaQueryWrapper（activeRoles 查角色表、closeOpenStatusLog 查状态流水表）。
     * 无 MyBatis 容器时必须先初始化 TableInfo，否则 lambda 列解析直接抛错。
     */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmRequirementRole.class);
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmStatusLog.class);
    }

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        roleMapper = mock(com.mftb.admin.mapper.RdmRequirementRoleMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        // 默认无参与人记录（避免拆箱 null），相关与否由主数据字段判定
        when(roleMapper.selectCount(any())).thenReturn(0L);
        // 数据范围与角色口径已收到 RdmAccessGuard，它必须与需求服务用同一套 mock，
        // 否则测试里“可见/无权”的结论与真实调用链不是一个口径
        accessGuard = new RdmAccessGuard(operatorResolver, permissionService, requirementMapper, roleMapper,
                mock(com.mftb.admin.mapper.RdmProjectMemberMapper.class),
                mock(com.mftb.admin.mapper.RdmProjectMapper.class),
                mock(com.mftb.admin.mapper.RdmDeliveryItemMapper.class),
                mock(com.mftb.admin.mapper.RdmTestBatchMapper.class),
                mock(com.mftb.admin.mapper.RdmReleaseBatchMapper.class));
        configService = mock(RdmConfigService.class);
        notifyService = mock(RdmNotifyService.class);
        service = new RdmRequirementServiceImpl(
                requirementMapper, mock(RdmRequirementTargetMapper.class),
                roleMapper, mock(RdmStatusLogMapper.class),
                mock(RdmCommentMapper.class), mock(RdmAttachmentMapper.class),
                mock(RdmAcceptanceMapper.class), mock(com.mftb.admin.mapper.RdmAcceptanceCaseMapper.class),
                mock(SysUserMapper.class),
                mock(SysDepartmentMapper.class), mock(BizSeqService.class),
                operatorResolver, configService,
                notifyService, mock(OaRequestService.class),
                mock(com.mftb.admin.service.RdmIntakeCallbackService.class),
                permissionService, mock(JdbcTemplate.class), accessGuard,
                mock(com.mftb.admin.mapper.RdmWorkTaskMapper.class),
                mock(com.mftb.admin.service.RdmIntakePolicyService.class),
                mock(com.mftb.admin.service.RdmIntakeRoundService.class),
                mock(com.mftb.admin.service.RdmReleaseService.class),
                mock(com.mftb.admin.service.RdmFlowVersionGuard.class),
                mock(com.mftb.admin.service.RdmRequirementStructureService.class),
                mock(com.mftb.admin.service.RdmDeliveryItemService.class),
                mock(com.mftb.admin.service.RdmAllowedActionsService.class),
                mock(com.mftb.admin.service.RdmPrdTaskService.class));
    }

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId(empId);
        u.setName(name);
        return u;
    }

    private static RdmConfigVO.Transition rule(List<String> roles, List<String> requiredFields) {
        RdmConfigVO.Transition t = new RdmConfigVO.Transition();
        t.setId(1L);
        t.setFromStatus(RdmConstants.STATUS_EVALUATING);
        t.setToStatus(RDM_STATUS_ACCEPTED);
        t.setActionCode(RdmConstants.ACTION_ACCEPT);
        t.setActionName("接受需求");
        t.setAllowedRoles(roles);
        t.setRequiredFields(requiredFields);
        t.setEnabled(true);
        return t;
    }

    /** 目标状态字面量（避免测试内硬编码与常量表耦合） */
    private static final String RDM_STATUS_ACCEPTED = "accepted";

    @Test
    @DisplayName("超管不受角色限制")
    void adminBypassesRoleGuard() {
        SysUser admin = user(1L, "MF00001", "馮宋");
        when(operatorResolver.isAdmin(admin)).thenReturn(true);
        assertTrue(service.canPerform(rule(List.of(RdmConstants.ROLE_PM), List.of()), admin, Set.of()));
    }

    @Test
    @DisplayName("角色命中允许列表才可推进，未命中一律拒")
    void roleMustBeAllowed() {
        SysUser pm = user(2L, "MF00002", "陳雅婷");
        SysUser qa = user(3L, "MF00003", "黃嘉欣");
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        assertTrue(service.canPerform(rule(List.of(RdmConstants.ROLE_PM), List.of()), pm, Set.of(RdmConstants.ROLE_PM)));
        assertFalse(service.canPerform(rule(List.of(RdmConstants.ROLE_PM), List.of()), qa, Set.of(RdmConstants.ROLE_QA)));
    }

    /**
     * 兼任者必须拿到其合法角色的并集。
     * <p>回归场景：提出人兼验收人时，单角色 findFirst 会按写入顺序返 SUBMITTER，
     * 只允许 ACCEPTOR 的交付确认动作就被误拒。
     */
    @Test
    @DisplayName("多角色中任一命中即放行（兼任者不被写入顺序误拒）")
    void anyHitRoleAllowsTransition() {
        SysUser submitter = user(20L, "MF00020", "林小明");
        when(operatorResolver.isAdmin(submitter)).thenReturn(false);
        assertTrue(service.canPerform(
                rule(List.of(RdmConstants.ROLE_ACCEPTOR), List.of()), submitter,
                Set.of(RdmConstants.ROLE_SUBMITTER, RdmConstants.ROLE_ACCEPTOR)));
    }

    @Test
    @DisplayName("未登录或规则未配角色时拒（不得 fail-open）")
    void failClosedWhenContextMissing() {
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        assertFalse(service.canPerform(rule(List.of(RdmConstants.ROLE_PM), List.of()), null, Set.of(RDM_STATUS_ACCEPTED)));
        assertFalse(service.canPerform(rule(List.of(), List.of()), user(2L, "MF00002", "陳雅婷"), Set.of(RdmConstants.ROLE_PM)));
    }

    @Test
    @DisplayName("分配动作可按「需求池编辑权」兜底放行")
    void dispatchFallsBackToIntakeMenuPermission() {
        SysUser techLead = user(4L, "MF00004", "李海濤");
        when(operatorResolver.isAdmin(techLead)).thenReturn(false);
        when(permissionService.hasPermission(techLead, RdmConstants.MENU_INTAKE, "edit")).thenReturn(true);
        RdmConfigVO.Transition dispatch = rule(List.of(RdmConstants.ROLE_DISPATCHER), List.of("pm"));
        assertTrue(service.canPerform(dispatch, techLead, Set.of()));
    }

    /**
     * 反向护栏：只有产品处理权（rdm-requirement:edit）不等于分配权。
     * <p>为什么现在就要钉住：菜单退役那一批要把两个菜单的权限锚点合并到
     * {@code rdm-requirement}（保留广被引用的锚点、软删几乎未投用的 rdm-intake）。
     * 合并时如果把分配/改派也改成读 {@code rdm-requirement:edit}，受理权与分配权就砸成一个动作，
     * 今后给产品同事开受理权会连带拿到全池分配权。今天两边都只有 admin 持有，看不出问题；
     * 没这条断言就只能等出事才发现。保持两个动作分开（例如另设 dispatch）是合并的前提。
     */
    @Test
    @DisplayName("仅有产品处理权不等于分配权（合并菜单锚点时不得坍缩）")
    void requirementEditAloneDoesNotGrantDispatch() {
        SysUser pm = user(5L, "MF00005", "陳雅婷");
        when(operatorResolver.isAdmin(pm)).thenReturn(false);
        // 只给产品处理/受理权，不给需求池（分配）编辑权
        when(permissionService.hasPermission(pm, RdmConstants.MENU_REQUIREMENT, "edit")).thenReturn(true);
        RdmConfigVO.Transition dispatch = rule(List.of(RdmConstants.ROLE_DISPATCHER), List.of("pm"));
        assertFalse(service.canPerform(dispatch, pm, Set.of()),
                "rdm-requirement:edit 是产品处理权，不得被当成需求池分配权兜底放行");
    }

    @Test
    @DisplayName("必填字段缺失时拒绝，并提示中文字段名")
    void requiredFieldMustBeFilled() {
        RdmConfigVO.Transition accept = rule(List.of(RdmConstants.ROLE_PM), List.of("promisedDate"));
        RdmTransitionDTO empty = new RdmTransitionDTO();
        BusinessException ex = assertThrows(BusinessException.class, () -> service.applyRequiredGuard(null, accept, empty));
        assertTrue(ex.getMessage().contains("承諾出 PRD 日期"), ex.getMessage());

        RdmTransitionDTO filled = new RdmTransitionDTO();
        filled.setPromisedDate("2026-10-15");
        assertDoesNotThrow(() -> service.applyRequiredGuard(null, accept, filled));
    }

    @Test
    @DisplayName("驳回理由与产品经理同为必填口径")
    void remarkAndPmAreRequired() {
        RdmConfigVO.Transition reject = rule(List.of(RdmConstants.ROLE_PM), List.of("remark"));
        RdmTransitionDTO blank = new RdmTransitionDTO();
        blank.setRemark("   ");
        assertThrows(BusinessException.class, () -> service.applyRequiredGuard(null, reject, blank));

        RdmConfigVO.Transition dispatch = rule(List.of(RdmConstants.ROLE_DISPATCHER), List.of("pm"));
        RdmTransitionDTO noPm = new RdmTransitionDTO();
        noPm.setPmUserId(null);
        assertThrows(BusinessException.class, () -> service.applyRequiredGuard(null, dispatch, noPm));

        when(permissionService.hasPermission(any(), eq(RdmConstants.MENU_INTAKE), eq("edit"))).thenReturn(true);
        RdmTransitionDTO withPm = new RdmTransitionDTO();
        withPm.setPmUserId(9L);
        assertDoesNotThrow(() -> service.applyRequiredGuard(null, dispatch, withPm));
    }

    /**
     * 排期必填「project/iteration」回归。
     * <p>历史上这两个 key 漏在 switch 外，恒落到 {@code default -> null}：
     * v1.2 迁移把 schedule.required_fields 补成 {@code planDate,project,iteration} 后，
     * 弹窗里明明选好了项目与迭代，后端仍恒报「需要填寫「project」」。
     */
    @Test
    @DisplayName("排期必填项目/迭代：请求带值或需求已挂归属均放行，两处都没有才拒")
    void scheduleProjectAndIterationAreRequired() {
        RdmConfigVO.Transition schedule = rule(List.of(RdmConstants.ROLE_PM), List.of("planDate", "project", "iteration"));
        schedule.setActionCode("schedule");
        schedule.setActionName("提交排期");

        // 1) 弹窗内选好项目+迭代
        RdmTransitionDTO withOwnership = new RdmTransitionDTO();
        withOwnership.setPlanDate("2026-12-31");
        withOwnership.setProjectId(901L);
        withOwnership.setIterationCode("PROJ2026101901-1");
        assertDoesNotThrow(() -> service.applyRequiredGuard(null, schedule, withOwnership));

        // 2) 请求未带归属，但属性栏已挂好：按已有值复核，不得要求重选
        com.mftb.admin.entity.RdmRequirement existing = new com.mftb.admin.entity.RdmRequirement();
        existing.setProjectId(902L);
        existing.setIterationCode("PROJ2026101901-2");
        RdmTransitionDTO planOnly = new RdmTransitionDTO();
        planOnly.setPlanDate("2026-12-31");
        assertDoesNotThrow(() -> service.applyRequiredGuard(existing, schedule, planOnly));

        // 3) 两处都没有：拒绝，且提示中文字段名而不是英文 key
        RdmTransitionDTO nothing = new RdmTransitionDTO();
        nothing.setPlanDate("2026-12-31");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.applyRequiredGuard(new com.mftb.admin.entity.RdmRequirement(), schedule, nothing));
        assertTrue(ex.getMessage().contains("所屬項目"), ex.getMessage());
    }

    /* ==================== 单条需求可见性（防猜 id 越权） ==================== */

    private static com.mftb.admin.entity.RdmRequirement requirement(long id, long submitterId, Long acceptorId) {
        com.mftb.admin.entity.RdmRequirement r = new com.mftb.admin.entity.RdmRequirement();
        r.setId(id);
        r.setReqNo("XQ20260930000" + id);
        r.setStatus(RdmConstants.STATUS_POOL);
        r.setSubmitterUserId(submitterId);
        r.setAcceptorUserId(acceptorId);
        return r;
    }

    @Test
    @DisplayName("提出人能看自己的需求详情")
    void submitterCanViewOwnRequirement() {
        SysUser me = user(11L, "MF00011", "張三") ;
        when(operatorResolver.isAdmin(me)).thenReturn(false);
        assertDoesNotThrow(() -> service.requireVisible(requirement(1L, 11L, 11L), me, "查看詳情"));
    }

    @Test
    @DisplayName("无关员工猜 id 也不能读别人的需求")
    void strangerCannotViewOtherRequirement() {
        SysUser me = user(12L, "MF00012", "李四");
        when(operatorResolver.isAdmin(me)).thenReturn(false);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.requireVisible(requirement(2L, 11L, 11L), me, "查看詳情"));
        assertTrue(ex.getMessage().contains("查看詳情"), ex.getMessage());
    }

    @Test
    @DisplayName("超管与被授需求池查看权的人可跨部门查看")
    void privilegedUsersSeeAll() {
        SysUser admin = user(13L, "MF00013", "王五");
        when(operatorResolver.isAdmin(admin)).thenReturn(true);
        assertDoesNotThrow(() -> service.requireVisible(requirement(3L, 11L, 11L), admin, "查看詳情"));

        SysUser dispatcher = user(14L, "MF00014", "趙六");
        when(operatorResolver.isAdmin(dispatcher)).thenReturn(false);
        when(permissionService.hasPermission(dispatcher, RdmConstants.MENU_INTAKE, "view")).thenReturn(true);
        assertDoesNotThrow(() -> service.requireVisible(requirement(3L, 11L, 11L), dispatcher, "查看詳情"));
    }

    /**
     * 数据范围只由分配侧授权（需求池 view）决定，不被台账的动作权顺带拓开。
     * <p>这条断言专门防回退：以前持有 rdm-requirement 的 export/delete 就等于能看到全公司需求，
     * 而 rdm-requirement 是人人可看的宽权限菜单，那等于“能导 Excel 就能读全公司单据”。
     */
    @Test
    @DisplayName("仅有台账导出/删除权不等于全量可见")
    void actionGrantsAloneDoNotOpenAllData() {
        SysUser exporter = user(15L, "MF00015", "孫七");
        when(operatorResolver.isAdmin(exporter)).thenReturn(false);
        when(permissionService.hasPermission(exporter, RdmConstants.MENU_REQUIREMENT, "export")).thenReturn(true);
        when(permissionService.hasPermission(exporter, RdmConstants.MENU_REQUIREMENT, "delete")).thenReturn(true);
        assertThrows(BusinessException.class,
                () -> service.requireVisible(requirement(4L, 11L, 11L), exporter, "查看詳情"));
    }

    /* ==================== 流转通知透传说明/理由（逆向动作理由可达性） ==================== */

    private static RdmConfigVO.Transition transitionRule(String from, String to, String code, String name,
                                                         List<String> roles, List<String> requiredFields) {
        RdmConfigVO.Transition t = new RdmConfigVO.Transition();
        t.setId(25L);
        t.setFromStatus(from);
        t.setToStatus(to);
        t.setActionCode(code);
        t.setActionName(name);
        t.setAllowedRoles(roles);
        t.setRequiredFields(requiredFields);
        t.setEnabled(true);
        return t;
    }

    private static com.mftb.admin.entity.RdmRequirement testingReq() {
        com.mftb.admin.entity.RdmRequirement r = new com.mftb.admin.entity.RdmRequirement();
        r.setId(1L);
        r.setReqNo("XQ202610270024");
        r.setTitle("【廣告】-無敵星星");
        r.setStatus(RdmConstants.STATUS_TESTING);
        r.setDevOwnerUserId(4L);
        r.setDevOwnerName("李吉月");
        return r;
    }

    /**
     * 回归背景：测试退回/验收退回的通知此前只有动作/状态/操作人，
     * 研发收到「測試退回開發」通知后还要进详情页才能看到退回原因；
     * 理由本身已落流转记录，通知必须带同一份事实。
     */
    @Test
    @DisplayName("測試退回開發：通知文案带退回理由，且理由仍落驳回字段")
    void testRejectNotificationCarriesRemark() {
        SysUser qa = user(3L, "MF00003", "黃嘉欣");
        when(operatorResolver.currentUser()).thenReturn(qa);
        when(operatorResolver.isAdmin(qa)).thenReturn(true);
        when(operatorResolver.operatorSignature(qa)).thenReturn("MF00003|黃嘉欣");
        com.mftb.admin.entity.RdmRequirement req = testingReq();
        when(requirementMapper.selectById(1L)).thenReturn(req);
        when(configService.findTransition(RdmConstants.STATUS_TESTING, RdmConstants.ACTION_TEST_REJECT))
                .thenReturn(transitionRule(RdmConstants.STATUS_TESTING, RdmConstants.STATUS_DEVELOPING,
                        RdmConstants.ACTION_TEST_REJECT, "測試退回開發",
                        List.of(RdmConstants.ROLE_QA), List.of("remark")));
        when(configService.stageMap()).thenReturn(Map.of());
        when(configService.statusLabelMap()).thenReturn(Map.of());

        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setActionCode(RdmConstants.ACTION_TEST_REJECT);
        dto.setRemark("冒煙不通過：商戶端下單接口 500，明細見評論");

        service.transition(1L, dto);

        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(notifyService).notifyUserIds(eq(RdmConstants.EVENT_STATUS_CHANGED), any(), any(), anyString(), text.capture());
        assertTrue(text.getValue().contains("說明/理由"), text.getValue());
        assertTrue(text.getValue().contains("冒煙不通過：商戶端下單接口 500，明細見評論"), text.getValue());
        // 通知只是多一个读取侧：驳回事实仍落主表，不替代流转记录
        assertEquals("冒煙不通過：商戶端下單接口 500，明細見評論", req.getRejectReason());
        assertEquals(1, req.getRejectCount());
    }

    @Test
    @DisplayName("開發完成轉測試：无说明时通知不渲染空「說明/理由」行")
    void forwardTransitionWithoutRemarkOmitsRemarkLine() {
        SysUser dev = user(4L, "MF00004", "李吉月");
        when(operatorResolver.currentUser()).thenReturn(dev);
        when(operatorResolver.isAdmin(dev)).thenReturn(true);
        when(operatorResolver.operatorSignature(dev)).thenReturn("MF00004|李吉月");
        com.mftb.admin.entity.RdmRequirement req = testingReq();
        req.setStatus(RdmConstants.STATUS_DEVELOPING);
        when(requirementMapper.selectById(1L)).thenReturn(req);
        when(configService.findTransition(RdmConstants.STATUS_DEVELOPING, RdmConstants.ACTION_DEV_DONE))
                .thenReturn(transitionRule(RdmConstants.STATUS_DEVELOPING, RdmConstants.STATUS_TESTING,
                        RdmConstants.ACTION_DEV_DONE, "開發完成轉測試",
                        List.of(RdmConstants.ROLE_DEV, RdmConstants.ROLE_DEV_LEAD), List.of()));
        when(configService.stageMap()).thenReturn(Map.of());
        when(configService.statusLabelMap()).thenReturn(Map.of());

        RdmTransitionDTO dto = new RdmTransitionDTO();
        dto.setActionCode(RdmConstants.ACTION_DEV_DONE);

        service.transition(1L, dto);

        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(notifyService).notifyUserIds(eq(RdmConstants.EVENT_STATUS_CHANGED), any(), any(), anyString(), text.capture());
        assertFalse(text.getValue().contains("說明/理由"), text.getValue());
    }
}
