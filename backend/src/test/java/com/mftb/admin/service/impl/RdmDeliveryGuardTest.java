package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmDeliveryDTO;
import com.mftb.admin.dto.RdmDeliveryVO;
import com.mftb.admin.entity.RdmIteration;
import com.mftb.admin.entity.RdmMilestone;
import com.mftb.admin.entity.RdmPrd;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmReview;
import com.mftb.admin.entity.RdmTaskTypeConfig;
import com.mftb.admin.entity.RdmWorkLog;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.mapper.RdmChangeRequestMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmIterationMapper;
import com.mftb.admin.mapper.RdmMilestoneMapper;
import com.mftb.admin.mapper.RdmPrdMapper;
import com.mftb.admin.mapper.RdmPrdSnapshotMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmReviewMapper;
import com.mftb.admin.mapper.RdmWorkLogMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.HrAssignmentQuery;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmDeliveryService;
import com.mftb.admin.service.RdmFlowVersionGuard;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.service.RdmRequirementService;
import com.mftb.admin.service.RdmTaskTypeService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 交付守卫测试（阶段 3）。
 * <p>锁死的是「计划与交付事实不能被糊过去」这几条：
 * <ol>
 *   <li>已定稿的 PRD 不可原地修改，只能开新版本并写原因；</li>
 *   <li>任务估时/日期必须自洽，负责人必须在职启用（无研发交付权限只提醒不阻断）；</li>
 *   <li>完成任务必须留交付说明，不再自动补 1 工日；</li>
 *   <li>基线冻结后初步计划不可回改，不适用节点必须写原因。</li>
 * </ol>
 */
class RdmDeliveryGuardTest {

    /** assignTaskOwner 用 LambdaUpdateWrapper 需要 RdmWorkTask 的 TableInfo 缓存（纯 Mockito 环境不会自动建） */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, RdmWorkTask.class);
        TableInfoHelper.initTableInfo(assistant, RdmPrd.class);
        // 进度审计实体在条件更新后插入，纯 Mockito 环境同样需要 TableInfo 缓存
        TableInfoHelper.initTableInfo(assistant, com.mftb.admin.entity.RdmTaskProgressLog.class);
    }

    private RdmAccessGuard accessGuard;
    private RdmPrdMapper prdMapper;
    private RdmWorkTaskMapper taskMapper;
    private RdmMilestoneMapper milestoneMapper;
    private RdmWorkLogMapper workLogMapper;
    private RdmIterationMapper iterationMapper;
    private RdmRequirementMapper requirementMapper;
    private RdmReviewMapper reviewMapper;
    /** createReview 落库实体捕獲：多选评审类型归一化后必须原样进 review_type */
    private final List<RdmReview> insertedReviews = new ArrayList<>();
    private OperatorResolver operatorResolver;
    private SysUserMapper userMapper;
    private PermissionService permissionService;
    private RdmTaskTypeService taskTypeService;
    private com.mftb.admin.mapper.RdmTaskProgressLogMapper progressLogMapper;
    /** 当前任职口径：表单「所屬部門」回显最新部门用；没返回时服务端回退账号快照 */
    private HrAssignmentQuery hrAssignmentQuery;
    private RdmDeliveryService service;

    @BeforeEach
    void setUp() {
        prdMapper = mock(RdmPrdMapper.class);
        taskMapper = mock(RdmWorkTaskMapper.class);
        milestoneMapper = mock(RdmMilestoneMapper.class);
        workLogMapper = mock(RdmWorkLogMapper.class);
        iterationMapper = mock(RdmIterationMapper.class);
        requirementMapper = mock(RdmRequirementMapper.class);
        reviewMapper = mock(RdmReviewMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        operatorResolver = mock(OperatorResolver.class);
        userMapper = mock(SysUserMapper.class);
        permissionService = mock(PermissionService.class);
        taskTypeService = mock(RdmTaskTypeService.class);
        progressLogMapper = mock(com.mftb.admin.mapper.RdmTaskProgressLogMapper.class);
        hrAssignmentQuery = mock(HrAssignmentQuery.class);
        when(hrAssignmentQuery.asOf(any(), any())).thenReturn(java.util.Optional.empty());
        // 任务类型字典 stub：六种内置 code 放行（resolveByCode 非 null），其余 null 被 validateTaskForm 拒绝；
        // categoryOf 按内置三桶兑底，保证 roleOfTaskType 的 switch 不落 null
        when(taskTypeService.resolveByCode(anyString())).thenAnswer(inv -> {
            String code = inv.getArgument(0);
            return BUILTIN_TASK_CODES.contains(code) ? taskTypeCfg(code) : null;
        });
        when(taskTypeService.categoryOf(anyString())).thenAnswer(inv -> builtinCategoryOf(inv.getArgument(0)));
        when(operatorResolver.operatorSignature(any())).thenReturn("MF00041|李四");
        // 当前登录人固定为任务负责人：工时明细只允许本人填报，多个用例要走到真实分支
        when(operatorResolver.currentUser()).thenReturn(owner41());
        service = new RdmDeliveryServiceImpl(
                prdMapper, reviewMapper, taskMapper,
                iterationMapper, mock(RdmChangeRequestMapper.class),
                requirementMapper, mock(RdmRequirementRoleMapper.class), userMapper,
                mock(BizSeqService.class), operatorResolver, mock(RdmConfigService.class),
                mock(RdmNotifyService.class), mock(RdmRequirementService.class),
                mock(OaRequestService.class), mock(JdbcTemplate.class), accessGuard,
                milestoneMapper, workLogMapper, mock(RdmPrdSnapshotMapper.class),
                permissionService, mock(RdmDeliveryItemMapper.class), mock(RdmFlowVersionGuard.class), taskTypeService,
                mock(com.mftb.admin.service.RdmPrdTaskService.class),
                mock(com.mftb.admin.service.RdmDeliveryItemService.class),
                progressLogMapper,
                mock(com.mftb.admin.service.RdmTeamScopeService.class),
                hrAssignmentQuery);
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString())).thenReturn(requirement(RdmConstants.STATUS_ACCEPTED));
        when(accessGuard.requireVisible(anyLong(), anyString())).thenReturn(requirement(RdmConstants.STATUS_ACCEPTED));
        when(requirementMapper.selectById(any())).thenReturn(requirement(RdmConstants.STATUS_ACCEPTED));
        when(milestoneMapper.selectList(any())).thenReturn(List.of());
        when(milestoneMapper.selectOne(any())).thenReturn(null);
        when(prdMapper.selectById(any())).thenReturn(frozenPrd());
        when(prdMapper.update(any(), any())).thenReturn(1);
        when(taskMapper.selectById(any())).thenReturn(task());
        // createReview 链路：插入捕获 + 回读同一条实体，joinNames 需要真实姓名
        when(reviewMapper.insert(any(RdmReview.class))).thenAnswer(i -> {
            RdmReview r = i.getArgument(0);
            r.setId(100L + insertedReviews.size());
            insertedReviews.add(r);
            return 1;
        });
        when(reviewMapper.selectById(any())).thenAnswer(i ->
                insertedReviews.isEmpty() ? null : insertedReviews.get(insertedReviews.size() - 1));
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(owner41()));
    }

    /** 任务负责人（ownerUserId=41，与 task() 一致） */
    private static com.mftb.admin.entity.SysUser owner41() {
        com.mftb.admin.entity.SysUser u = new com.mftb.admin.entity.SysUser();
        u.setId(41L);
        u.setEmpId("MF00041");
        u.setName("李四");
        u.setStatus(1);
        return u;
    }

    private static RdmRequirement requirement(String status) {
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610060001");
        req.setTitle("門店自營活動報名後台");
        req.setStatus(status);
        req.setSubmitterUserId(11L);
        req.setAssigneePmUserId(21L);
        req.setAssigneePmName("陳雅婷");
        return req;
    }

    private static RdmPrd draftPrd(int rowVersion) {
        RdmPrd prd = frozenPrd();
        prd.setStatus("draft");
        prd.setRowVersion(rowVersion);
        return prd;
    }

    private static RdmPrd frozenPrd() {
        RdmPrd prd = new RdmPrd();
        prd.setId(9L);
        prd.setReqId(1L);
        prd.setPrdNo("PRD202610060001");
        prd.setTitle("活動報名後台 PRD");
        prd.setStatus("approved");
        prd.setVersionNo("v1.0");
        return prd;
    }

    @Test
    @DisplayName("负载页任务指派：乐观锁版本一致则改负责人成功")
    void assignTaskOwnerSucceedsOnVersionMatch() {
        when(userMapper.selectById(any())).thenReturn(owner41());
        when(taskMapper.update(any(), any())).thenReturn(1);
        RdmDeliveryVO.Task vo = service.assignTaskOwner(5L, 41L, 1);
        assertNotNull(vo, "乐观锁命中则返回更新后的任务");
        verify(taskMapper).update(any(), any());
    }

    @Test
    @DisplayName("负载页任务指派：乐观锁版本不一致（他人已改）抛 CONFLICT，两改派仅一笔成功")
    void assignTaskOwnerRejectsVersionConflict() {
        when(userMapper.selectById(any())).thenReturn(owner41());
        when(taskMapper.update(any(), any())).thenReturn(0);
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.assignTaskOwner(5L, 41L, 99));
        assertTrue(ex.getMessage().contains("已被他人修改"), ex.getMessage());
    }

    @Test
    @DisplayName("负载页任务指派：目标负责人已停用时拒绝")
    void assignTaskOwnerRejectsInactiveTarget() {
        com.mftb.admin.entity.SysUser inactive = owner41();
        inactive.setStatus(0);
        when(userMapper.selectById(any())).thenReturn(inactive);
        assertThrows(BusinessException.class, () -> service.assignTaskOwner(5L, 41L, 1));
    }

    @Test
    @DisplayName("负载页任务指派：无交付写权（requireDeliveryWriter 拒）则不能指派")
    void assignTaskOwnerRequiresWriter() {
        when(userMapper.selectById(any())).thenReturn(owner41());
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString()))
                .thenThrow(new BusinessException("您不是該需求的參與人"));
        assertThrows(BusinessException.class, () -> service.assignTaskOwner(5L, 41L, 1));
    }

    /** 内置六码（与字典种子同源）：resolveByCode 只对它们返回非 null */
    private static final Set<String> BUILTIN_TASK_CODES = Set.of("design", "frontend", "app", "backend", "qa", "data");

    private static RdmTaskTypeConfig taskTypeCfg(String code) {
        RdmTaskTypeConfig cfg = new RdmTaskTypeConfig();
        cfg.setCode(code);
        cfg.setLabel(code);
        cfg.setCategory(builtinCategoryOf(code));
        return cfg;
    }

    /** 内置三桶兑底（与 RdmTaskTypeServiceImpl.legacyCategoryOf 同语义） */
    private static String builtinCategoryOf(String code) {
        return switch (code == null ? "" : code) {
            case RdmTaskTypeConfig.CATEGORY_DESIGN -> RdmTaskTypeConfig.CATEGORY_DESIGN;
            case RdmTaskTypeConfig.CATEGORY_QA -> RdmTaskTypeConfig.CATEGORY_QA;
            default -> RdmTaskTypeConfig.CATEGORY_DEV;
        };
    }

    private static RdmWorkTask task() {
        RdmWorkTask task = new RdmWorkTask();
        task.setId(5L);
        task.setReqId(1L);
        task.setTaskType("backend");
        task.setTitle("報名接口開發");
        task.setStatus("doing");
        task.setOwnerUserId(41L);
        return task;
    }

    private static RdmDeliveryDTO.Task taskDto(String type, BigDecimal planHours, String start, String finish) {
        RdmDeliveryDTO.Task dto = new RdmDeliveryDTO.Task();
        dto.setReqId(1L);
        dto.setTaskType(type);
        dto.setTitle("報名接口開發");
        dto.setPlanHours(planHours);
        dto.setPlanStartDate(start);
        dto.setPlanFinishDate(finish);
        return dto;
    }

    private static RdmDeliveryDTO.Milestone milestone(String code, String status, String preliminary, String reason) {
        RdmDeliveryDTO.Milestone m = new RdmDeliveryDTO.Milestone();
        m.setCode(code);
        m.setStatus(status);
        m.setPreliminaryDate(preliminary);
        m.setNaReason(reason);
        return m;
    }

    private static RdmDeliveryDTO.Review reviewDto(String reviewType) {
        RdmDeliveryDTO.Review dto = new RdmDeliveryDTO.Review();
        dto.setReqId(1L);
        dto.setReviewType(reviewType);
        dto.setParticipantIds(List.of(41L));
        return dto;
    }

    @Test
    @DisplayName("未知评审类型 token 直接拒绝：不落库也不进通知文案")
    void unknownReviewTypeTokenIsRejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createReview(reviewDto("dev,security")));
        assertTrue(ex.getMessage().contains("評審類型不正確"), ex.getMessage());
        assertTrue(insertedReviews.isEmpty());
    }

    @Test
    @DisplayName("多选评审类型去空格去重后逗号拼接落库")
    void multiReviewTypesAreNormalizedBeforePersist() {
        RdmDeliveryVO.Review vo = service.createReview(reviewDto(" test , dev,dev "));
        assertEquals("test,dev", vo.getReviewType());
        assertEquals("test,dev", insertedReviews.get(0).getReviewType());
    }

    @Test
    @DisplayName("评审类型标签：多值逐段连接，单值与空值兼容历史数据")
    void reviewTypeLabelSupportsMultiAndLegacyValues() {
        assertEquals("測試評審 / 研發評審", RdmDeliveryServiceImpl.reviewTypeLabel("test,dev"));
        assertEquals("UI 評審", RdmDeliveryServiceImpl.reviewTypeLabel("ui"));
        assertEquals("-", RdmDeliveryServiceImpl.reviewTypeLabel(null));
        assertEquals("-", RdmDeliveryServiceImpl.reviewTypeLabel("  "));
    }

    @Test
    @DisplayName("PRD 并发保存：版本号不一致时拒绝覆盖他人内容")
    void prdSaveRejectsStaleRowVersion() {
        when(prdMapper.selectById(any())).thenReturn(draftPrd(3));
        RdmDeliveryDTO.Prd dto = new RdmDeliveryDTO.Prd();
        dto.setId(9L);
        dto.setTitle("並發保存");
        dto.setContentRich("<p>正文</p>");
        dto.setExpectedRowVersion(2);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePrd(dto));
        assertTrue(ex.getMessage().contains("已被其他人保存"), ex.getMessage());
        // 冲突分支必须在落库前就返回，不能先写后报错
        verify(prdMapper, org.mockito.Mockito.never()).insert(any(RdmPrd.class));
    }

    @Test
    @DisplayName("PRD 并发保存：已有文档缺少版本时拒绝，防客户端跳过版本保护")
    void prdSaveWithoutExpectedVersionIsRejected() {
        when(prdMapper.selectById(any())).thenReturn(draftPrd(3));
        RdmDeliveryDTO.Prd dto = new RdmDeliveryDTO.Prd();
        dto.setId(9L);
        dto.setTitle("舊調用方");
        dto.setContentRich("<p>正文</p>");

        assertThrows(BusinessException.class, () -> service.savePrd(dto));
        verify(prdMapper, org.mockito.Mockito.never()).update(any(), any());
    }

    @Test
    @DisplayName("PRD 读取后被并发修改：WHERE 带版本，零行更新报冲突")
    void prdSaveUsesAtomicVersionPredicate() {
        when(prdMapper.selectById(any())).thenReturn(draftPrd(3));
        when(prdMapper.update(any(), any())).thenAnswer(inv -> {
            com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<RdmPrd> wrapper = inv.getArgument(1);
            assertTrue(wrapper.getSqlSegment().contains("row_version ="));
            assertTrue(wrapper.getParamNameValuePairs().containsValue(3));
            assertTrue(wrapper.getSqlSet().contains("row_version = row_version + 1"));
            return 0;
        });
        RdmDeliveryDTO.Prd dto = new RdmDeliveryDTO.Prd();
        dto.setId(9L);
        dto.setTitle("競態保存");
        dto.setExpectedRowVersion(3);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePrd(dto));
        assertEquals(com.mftb.admin.common.ResultCode.CONFLICT.getCode(), ex.getCode());
        verify(prdMapper, org.mockito.Mockito.never()).insert(any(RdmPrd.class));
    }

    @Test
    @DisplayName("PRD 同版本保存一次后递增，重复请求不再次写入")
    void prdSaveAdvancesVersionAndRejectsReplay() {
        RdmPrd prd = draftPrd(3);
        when(prdMapper.selectById(any())).thenReturn(prd);
        RdmDeliveryDTO.Prd dto = new RdmDeliveryDTO.Prd();
        dto.setId(9L);
        dto.setTitle("版本保存");
        dto.setExpectedRowVersion(3);
        dto.setAdvanceRequirement(false);
        assertEquals(4, service.savePrd(dto).getRowVersion());
        assertThrows(BusinessException.class, () -> service.savePrd(dto));
        verify(prdMapper).update(any(), any());
    }

    @Test
    @DisplayName("已定稿的 PRD 不可原地修改")
    void approvedPrdCannotBeEditedInPlace() {
        RdmDeliveryDTO.Prd dto = new RdmDeliveryDTO.Prd();
        dto.setId(9L);
        dto.setTitle("改了标题");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePrd(dto));
        assertTrue(ex.getMessage().contains("不可原地修改"), ex.getMessage());
    }

    @Test
    @DisplayName("开新版本必须写变更原因")
    void newVersionRequiresReason() {
        RdmDeliveryDTO.Prd dto = new RdmDeliveryDTO.Prd();
        dto.setId(9L);
        dto.setTitle("改了标题");
        dto.setNewVersion(true);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePrd(dto));
        assertTrue(ex.getMessage().contains("變更原因"), ex.getMessage());
    }

    @Test
    @DisplayName("受理前不能新建 PRD：评估中被业务闸门拒绝")
    void prdCannotBeCreatedBeforeAccepted() {
        when(requirementMapper.selectById(any())).thenReturn(requirement(RdmConstants.STATUS_EVALUATING));
        RdmDeliveryDTO.Prd dto = new RdmDeliveryDTO.Prd();
        dto.setReqId(1L);
        dto.setTitle("推廣金賬戶 PRD");
        dto.setContentRich("<p>正文</p>");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePrd(dto));
        assertTrue(ex.getMessage().contains("請先接受需求"), ex.getMessage());
    }

    @Test
    @DisplayName("受理前不能发起评审：评估中被业务闸门拒绝")
    void reviewCannotBeCreatedBeforeAccepted() {
        when(requirementMapper.selectById(any())).thenReturn(requirement(RdmConstants.STATUS_EVALUATING));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createReview(reviewDto("dev")));
        assertTrue(ex.getMessage().contains("請先接受需求"), ex.getMessage());
        assertTrue(insertedReviews.isEmpty());
    }

    @Test
    @DisplayName("负数估时、起止倒挂、未知任务类型都被拦下")
    void taskFormIsValidated() {
        assertThrows(BusinessException.class,
                () -> service.saveTask(taskDto("backend", new BigDecimal("-3"), null, null)));
        assertThrows(BusinessException.class,
                () -> service.saveTask(taskDto("backend", BigDecimal.TEN, "2026-10-20", "2026-10-10")));
        assertThrows(BusinessException.class,
                () -> service.saveTask(taskDto("firmware", BigDecimal.TEN, null, null)));
    }

    @Test
    @DisplayName("负责人无研发交付权限：只提醒不阻断，任务仍可保存")
    void ownerWithoutDeliveryPermissionStillSaves() {
        RdmDeliveryDTO.Task dto = taskDto("backend", BigDecimal.TEN, null, null);
        dto.setOwnerUserId(41L);
        when(userMapper.selectById(41L)).thenReturn(owner41());
        // PermissionService 默认返回 false = 该员工无交付权限
        assertDoesNotThrow(() -> service.saveTask(dto));

        RdmDeliveryVO.OwnerCheck check = service.checkTaskOwner(41L);
        assertFalse(check.getAble());
        assertFalse(check.getHardBlocked(), "无权限属于可先派活、后补权限，不得硬拦");
        assertTrue(check.getWarning().contains("無研發交付權限"), check.getWarning());
    }

    @Test
    @DisplayName("负责人部门取最新任职记录，不再读账号快照")
    void ownerDepartmentUsesLatestAssignment() {
        com.mftb.admin.entity.SysUser owner = owner41();
        // 账号快照是调动前的旧部门：人事系统改部门只写任职记录，不会回写 sys_user
        owner.setDepartment("後端研發部");
        when(userMapper.selectById(41L)).thenReturn(owner);
        com.mftb.admin.entity.EmpPositionRecord record = new com.mftb.admin.entity.EmpPositionRecord();
        record.setServiceDept("前端研發部");
        when(hrAssignmentQuery.asOf(any(), any())).thenReturn(java.util.Optional.of(record));

        RdmDeliveryVO.OwnerCheck check = service.checkTaskOwner(41L);
        assertTrue("前端研發部".equals(check.getDepartment()),
                "部门应取任职记录的最新值，实际：" + check.getDepartment());
    }

    @Test
    @DisplayName("任务计划上线不得晚于需求计划上线")
    void taskPlanReleaseMustNotExceedRequirement() {
        RdmRequirement req = requirement(RdmConstants.STATUS_ACCEPTED);
        req.setPlanReleaseDate(java.time.LocalDate.of(2026, 12, 31));
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString())).thenReturn(req);
        when(requirementMapper.selectById(any())).thenReturn(req);

        RdmDeliveryDTO.Task dto = taskDto("backend", BigDecimal.TEN, "2026-12-01", "2026-12-10");
        dto.setPlanReleaseDate("2027-01-05");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveTask(dto));
        assertTrue(ex.getMessage().contains("需求計劃上線"), ex.getMessage());
    }

    @Test
    @DisplayName("任务计划完成日不得晚于需求计划上线")
    void taskPlanFinishMustNotExceedRequirement() {
        RdmRequirement req = requirement(RdmConstants.STATUS_ACCEPTED);
        req.setPlanReleaseDate(java.time.LocalDate.of(2026, 12, 31));
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString())).thenReturn(req);
        when(requirementMapper.selectById(any())).thenReturn(req);

        RdmDeliveryDTO.Task dto = taskDto("backend", BigDecimal.TEN, "2026-12-20", "2027-01-10");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveTask(dto));
        assertTrue(ex.getMessage().contains("需求計劃上線"), ex.getMessage());
    }

    @Test
    @DisplayName("负责人已离职：预检标红且保存仍被拦下")
    void inactiveOwnerIsRejected() {
        com.mftb.admin.entity.SysUser gone = owner41();
        gone.setStatus(0);
        when(userMapper.selectById(41L)).thenReturn(gone);

        RdmDeliveryDTO.Task dto = taskDto("backend", BigDecimal.TEN, null, null);
        dto.setOwnerUserId(41L);
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveTask(dto));
        assertTrue(ex.getMessage().contains("離職或停用"), ex.getMessage());

        RdmDeliveryVO.OwnerCheck check = service.checkTaskOwner(41L);
        assertTrue(check.getHardBlocked(), "离职负责人保存时会被拦，预检必须先报错而不是给个黄色提醒");
    }

    @Test
    @DisplayName("负责人有交付权限：预检不弹提醒")
    void eligibleOwnerGetsNoWarning() {
        when(userMapper.selectById(41L)).thenReturn(owner41());
        when(permissionService.hasPermission(any(), any(), any())).thenReturn(true);

        RdmDeliveryVO.OwnerCheck check = service.checkTaskOwner(41L);
        assertTrue(check.getAble());
        assertNull(check.getWarning());
    }

    @Test
    @DisplayName("完成任务必须写交付说明，不再自动补 1 工日")
    void doneRequiresEvidenceAndNoFakeHours() {
        RdmDeliveryDTO.TaskProgress dto = new RdmDeliveryDTO.TaskProgress();
        dto.setAction("done");
        dto.setProgress(100);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.updateTaskProgress(5L, dto));
        assertTrue(ex.getMessage().contains("交付說明"), ex.getMessage());

        RdmDeliveryDTO.TaskProgress outOfRange = new RdmDeliveryDTO.TaskProgress();
        outOfRange.setAction("start");
        outOfRange.setProgress(180);
        assertThrows(BusinessException.class, () -> service.updateTaskProgress(5L, outOfRange));
    }

    @Test
    @DisplayName("開始任務：不帶進度時只改狀態，不把進度寫滿")
    void startKeepsProgressUntouched() {
        RdmWorkTask t = task();
        t.setStatus("todo");
        t.setProgress(0);
        when(taskMapper.selectById(any())).thenReturn(t);
        when(taskMapper.update(any(), any())).thenReturn(1);
        when(workLogMapper.selectList(any())).thenReturn(List.of());

        RdmDeliveryDTO.TaskProgress dto = new RdmDeliveryDTO.TaskProgress();
        dto.setAction("start");
        service.updateTaskProgress(5L, dto);

        assertEquals("doing", t.getStatus());
        assertEquals(0, t.getProgress(), "「開始」不得替人填進度");
        assertNotNull(t.getActualStartTime(), "開始必須留下實際開始時間");
    }

    /**
     * 回歸場景：前端把上報面板裡殘留的 100 一起帶給「開始」，任務就被寫成
     * 「進行中 + 100%」——100% 屬於完成態，任務永遠推不到完成，又因為未完成而一直算逾期。
     * 這類矛盾數據必須從寫入側拦住，不能靠界面兜。
     */
    @Test
    @DisplayName("開始任務：帶 100% 的進度一律拒絕，且不落庫")
    void startRejectsHundredProgress() {
        RdmWorkTask t = task();
        t.setStatus("todo");
        t.setProgress(0);
        when(taskMapper.selectById(any())).thenReturn(t);

        RdmDeliveryDTO.TaskProgress dto = new RdmDeliveryDTO.TaskProgress();
        dto.setAction("start");
        dto.setProgress(100);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.updateTaskProgress(5L, dto));
        assertTrue(ex.getMessage().contains("100%"), ex.getMessage());
        verify(taskMapper, org.mockito.Mockito.never()).update(any(), any());
    }

    @Test
    @DisplayName("開始任務：兼容舊客戶端帶 1~99 進度，但只往前推")
    void startAcceptsProgressWithoutRollingBack() {
        RdmWorkTask t = task();
        t.setStatus("todo");
        t.setProgress(60);
        when(taskMapper.selectById(any())).thenReturn(t);
        when(taskMapper.update(any(), any())).thenReturn(1);
        when(workLogMapper.selectList(any())).thenReturn(List.of());

        RdmDeliveryDTO.TaskProgress lower = new RdmDeliveryDTO.TaskProgress();
        lower.setAction("start");
        lower.setProgress(20);
        service.updateTaskProgress(5L, lower);
        assertEquals(60, t.getProgress(), "「開始」不得把已報進度改小");

        RdmDeliveryDTO.TaskProgress higher = new RdmDeliveryDTO.TaskProgress();
        higher.setAction("start");
        higher.setProgress(80);
        service.updateTaskProgress(5L, higher);
        assertEquals(80, t.getProgress());
    }

    @Test
    @DisplayName("甘特图拖进度：PRD 任务封顶 99%，100% 必须走提交评审")
    void prdProgressCannotReachHundred() {
        RdmWorkTask prd = task();
        prd.setTaskType("prd");
        prd.setStatus("doing");
        prd.setProgress(40);
        when(taskMapper.selectById(any())).thenReturn(prd);

        RdmDeliveryDTO.TaskProgress dto = new RdmDeliveryDTO.TaskProgress();
        dto.setAction("progress");
        dto.setProgress(100);
        dto.setExpectedProgress(40);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.updateTaskProgress(5L, dto));
        assertTrue(ex.getMessage().contains("提交評審"), ex.getMessage());
    }

    @Test
    @DisplayName("甘特图拖进度：期望进度已过期时拒绝覆盖")
    void progressConflictRejected() {
        RdmWorkTask t = task();
        t.setStatus("doing");
        t.setProgress(60);
        when(taskMapper.selectById(any())).thenReturn(t);

        RdmDeliveryDTO.TaskProgress dto = new RdmDeliveryDTO.TaskProgress();
        dto.setAction("progress");
        dto.setProgress(80);
        dto.setExpectedProgress(40);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.updateTaskProgress(5L, dto));
        assertTrue(ex.getMessage().contains("已被他人修改"), ex.getMessage());
    }

    @Test
    @DisplayName("甘特图拖进度：todo 任务改进度自动进入进行中，并留进度审计")
    void progressMovesTodoToDoingAndAudits() {
        RdmWorkTask t = task();
        t.setStatus("todo");
        t.setProgress(0);
        when(taskMapper.selectById(any())).thenReturn(t);
        when(taskMapper.update(any(), any())).thenReturn(1);
        when(workLogMapper.selectList(any())).thenReturn(List.of());

        RdmDeliveryDTO.TaskProgress dto = new RdmDeliveryDTO.TaskProgress();
        dto.setAction("progress");
        dto.setProgress(30);
        dto.setExpectedProgress(0);
        dto.setClientRequestId("gantt-progress-test");

        service.updateTaskProgress(5L, dto);

        assertEquals("doing", t.getStatus());
        assertEquals(30, t.getProgress());
        ArgumentCaptor<com.mftb.admin.entity.RdmTaskProgressLog> captor =
                ArgumentCaptor.forClass(com.mftb.admin.entity.RdmTaskProgressLog.class);
        verify(progressLogMapper).insert(captor.capture());
        assertEquals(0, captor.getValue().getOldProgress());
        assertEquals(30, captor.getValue().getNewProgress());
        assertEquals("gantt-progress-test", captor.getValue().getClientRequestId());
    }

    @Test
    @DisplayName("甘特图拖进度：阻塞任务必须先解除阻塞")
    void blockedTaskProgressRejected() {
        RdmWorkTask t = task();
        t.setStatus("blocked");
        t.setProgress(20);
        when(taskMapper.selectById(any())).thenReturn(t);

        RdmDeliveryDTO.TaskProgress dto = new RdmDeliveryDTO.TaskProgress();
        dto.setAction("progress");
        dto.setProgress(50);
        dto.setExpectedProgress(20);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.updateTaskProgress(5L, dto));
        assertTrue(ex.getMessage().contains("解除阻塞"), ex.getMessage());
    }

    @Test
    @DisplayName("节点标为不适用必须写原因")
    void notApplicableRequiresReason() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveMilestones(1L,
                List.of(milestone(RdmMilestone.CODE_DESIGN_DONE, RdmMilestone.STATUS_NOT_APPLICABLE, null, null))));
        assertTrue(ex.getMessage().contains("原因"), ex.getMessage());
    }

    @Test
    @DisplayName("基线已冻结的节点不能回改初步计划")
    void frozenBaselineLocksPreliminary() {
        RdmMilestone existing = new RdmMilestone();
        existing.setId(7L);
        existing.setReqId(1L);
        existing.setCode(RdmMilestone.CODE_DEV_DONE);
        existing.setName("開發完成");
        existing.setStatus(RdmMilestone.STATUS_PENDING);
        existing.setBaselineDate(LocalDate.of(2026, 10, 30));
        existing.setPreliminaryDate(LocalDate.of(2026, 10, 30));
        when(milestoneMapper.selectOne(any())).thenReturn(existing);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveMilestones(1L,
                List.of(milestone(RdmMilestone.CODE_DEV_DONE, RdmMilestone.STATUS_PENDING, "2026-11-20", null))));
        assertTrue(ex.getMessage().contains("基線已凍結"), ex.getMessage());
    }

    @Test
    @DisplayName("未到评审通过阶段不能冻结基线")
    void freezeRequiresReviewPassed() {
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString()))
                .thenReturn(requirement(RdmConstants.STATUS_PRD_DESIGNING));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.freezeMilestoneBaseline(1L));
        assertTrue(ex.getMessage().contains("凍結基線"), ex.getMessage());
    }

    @Test
    @DisplayName("无任何节点计划时不能冻结基线")
    void freezeNeedsPlanFirst() {
        // 先过状态关（评审通过），才能跑到「有没有计划」这一道
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString()))
                .thenReturn(requirement(RdmConstants.STATUS_REVIEW_PASSED));
        when(milestoneMapper.selectList(any())).thenReturn(List.of());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.freezeMilestoneBaseline(1L));
        assertTrue(ex.getMessage().contains("尚未規劃"), ex.getMessage());
    }

    /**
     * 评审/上线时间两种常见格式都要能解析。
     * <p>回归场景：LocalDateTime.parse 只认 ISO 的 'T'，把 T 换成空格的写法
     * 会让所有带空格的页面时间在改严之后直接报错（以前那么写会被静默当成 now）。
     */
    @Test
    @DisplayName("时间解析兼容空格与 ISO 格式")
    void dateTimeParsingAcceptsBothFormats() {
        java.time.LocalDateTime expected = java.time.LocalDateTime.of(2026, 10, 8, 20, 0);
        assertEquals(expected, RdmDeliveryServiceImpl.parseDateTimeStrict("2026-10-08 20:00"));
        assertEquals(expected, RdmDeliveryServiceImpl.parseDateTimeStrict("2026-10-08T20:00:00"));
        assertEquals(expected, RdmDeliveryServiceImpl.parseDateTimeStrict("2026-10-08T20:00"));
        // 不可解析时必须抛出（上层包成业务异常），不得再静默返回 now
        assertThrows(java.time.format.DateTimeParseException.class,
                () -> RdmDeliveryServiceImpl.parseDateTimeStrict("2026年10月8日 20:00"));
    }

    /** 未知节点编码直接拒绝：静默丢弃会让人以为节点已经盘过 */
    @Test
    @DisplayName("未知节点编码直接拒绝")
    void unknownMilestoneCodeRejected() {
        BusinessException ex = assertThrows(BusinessException.class, () -> service.saveMilestones(1L,
                List.of(milestone("LAUNCH_PARTY", RdmMilestone.STATUS_PENDING, "2026-11-01", null))));
        assertTrue(ex.getMessage().contains("節點編碼"), ex.getMessage());
    }

    /**
     * 补报过去的工时必须落在填报那一天，而不是今天。
     * <p>回归场景：开发昨天做了 6 小时、今天才上报；若被记成今天，
     * 负载核算与按日统计会双双失真，而表面上总数看起来还是对的。
     */
    @Test
    @DisplayName("工时明细按填报日期落库，不会全部堆到今天")
    void workLogKeepsReportedDate() {
        RdmDeliveryDTO.WorkLog entry = new RdmDeliveryDTO.WorkLog();
        entry.setWorkDate(LocalDate.now().minusDays(1).toString());
        entry.setHours(new BigDecimal("6"));

        service.saveWorkLogs(5L, List.of(entry));

        ArgumentCaptor<RdmWorkLog> captor = ArgumentCaptor.forClass(RdmWorkLog.class);
        verify(workLogMapper).insert(captor.capture());
        assertEquals(LocalDate.now().minusDays(1), captor.getValue().getWorkDate());
        assertEquals(new BigDecimal("6"), captor.getValue().getHours());
    }

    /**
     * 列表直改迭代状态：只回写状态与操作人。
     * <p>防线：若这条路径改回整条记录回写（走 saveIteration），列表快照里的旧产能/旧起止
     * 会盖掉别人刚保存的值——界面看着只是“改了个状态”，实际是一次全量覆盖。
     */
    @Test
    @DisplayName("列表直改迭代状态只写状态，非法值与不存在的迭代被拦下")
    void iterationStatusPatchOnlyWritesStatus() {
        RdmIteration stored = new RdmIteration();
        stored.setId(3L);
        stored.setCode("SP202610001");
        stored.setName("十月常規迭代");
        stored.setStatus("planning");
        when(iterationMapper.selectById(3L)).thenReturn(stored);

        service.updateIterationStatus(3L, "active");

        ArgumentCaptor<RdmIteration> captor = ArgumentCaptor.forClass(RdmIteration.class);
        verify(iterationMapper).updateById(captor.capture());
        assertEquals(Long.valueOf(3L), captor.getValue().getId());
        assertEquals("active", captor.getValue().getStatus());
        assertEquals("MF00041|李四", captor.getValue().getUpdatedBy());
        assertNull(captor.getValue().getName(), "只回写状态，不得带上其它列去覆盖");

        // 非法状态与空状态都不应落库，迭代不存在同样拒绝
        assertThrows(BusinessException.class, () -> service.updateIterationStatus(3L, "done"));
        assertThrows(BusinessException.class, () -> service.updateIterationStatus(3L, null));
        assertThrows(BusinessException.class, () -> service.updateIterationStatus(99L, "closed"));
        verify(iterationMapper).updateById(any(RdmIteration.class));
    }

    @Test
    @DisplayName("我的任務：管理員 scope=all 看全部；普通角色偽造 all 仍按負責人收斂")
    void myTasksAdminAllOnlyForAdmin() {
        RdmWorkTask mine = task();
        RdmWorkTask other = task();
        other.setId(999L);
        other.setOwnerUserId(99L);
        other.setTitle("他人的任務");

        List<com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<RdmWorkTask>> captured = new ArrayList<>();
        when(taskMapper.selectList(any())).thenAnswer(inv -> {
            com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<RdmWorkTask> wrapper = inv.getArgument(0);
            captured.add(wrapper);
            boolean ownerFiltered = wrapper.getSqlSegment().contains("owner_user_id");
            return ownerFiltered ? List.of(mine) : List.of(mine, other);
        });
        when(requirementMapper.selectById(any())).thenReturn(requirement(RdmConstants.STATUS_ACCEPTED));

        // 普通用户：即使前端传 all=true，也必须带 owner_user_id 条件，只能拿到自己的
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        assertEquals(1, service.myTasks(null, true).size());
        assertTrue(captured.get(0).getSqlSegment().contains("owner_user_id"),
                "非管理员传 all 不得放开范围");

        // 管理员：不带 owner 条件，返回全部
        captured.clear();
        when(operatorResolver.isAdmin(any())).thenReturn(true);
        assertEquals(2, service.myTasks(null, true).size());
        assertFalse(captured.get(0).getSqlSegment().contains("owner_user_id"),
                "管理员 scope=all 不应再按负责人收敛");

        // 管理员默认（不传 all）仍只看自己的：避免管理员误以为默认页就是全量
        captured.clear();
        assertEquals(1, service.myTasks(null, false).size());
        assertTrue(captured.get(0).getSqlSegment().contains("owner_user_id"));
    }
}
