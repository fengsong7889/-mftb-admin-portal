package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.dto.RdmProjectDTO;
import com.mftb.admin.dto.RdmProjectVO;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.RdmProjectMember;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmWorkTask;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * RDM 项目管理服务（Batch 1）。
 * <p>项目是「多需求协同交付」的组织单位：一个项目聚合多条需求，需求下再挂交付项。
 * 本服务只负责项目主档、成员与项目视角的汇总口径；需求自身的状态机仍由
 * {@link RdmRequirementService} 掌管，交付项由 {@link RdmDeliveryItemService} 掌管，
 * 三处不互写对方的状态，避免同一事实出现两个真相源。
 * <p>数据范围：非全量授权者只能看到自己参与（成员）的项目，读口径与写口径统一走
 * {@link RdmAccessGuard}。
 *
 * <p><b>任务22 的定位变化</b>：本类过去自带一套统计口径（{@code applyDeliveryStats} /
 * {@code deriveTestStatus} / {@code deriveAcceptanceStatus} / {@code getPendingItems}），
 * 与 {@link RdmSummaryService} 的那一套并存，同一事实能算出两个数字。现在项目维度的
 * <b>全部统计与待办</b>一律委派 {@link RdmProjectFactService}（唯一权威事实源），
 * 本类只负责项目主档写入、成员管理与把事实投影成页面 VO。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmProjectService {

    /** 项目编号规则 key（与 sys_biz_seq_rule.rule_key 一致） */
    private static final String SEQ_PROJECT = "rdm_project";

    /** 项目成员角色：六类负责人各自对应一行（rdm_project_member.role_code 口径，小写） */
    private static final String PROJECT_ROLE_PM = "pm";
    private static final String PROJECT_ROLE_PRODUCT = "product";
    private static final String PROJECT_ROLE_DEV_LEAD = "dev_lead";
    private static final String PROJECT_ROLE_DESIGNER = "designer";
    private static final String PROJECT_ROLE_QA = "qa";
    private static final String PROJECT_ROLE_OPS = "ops";
    /** 成员角色白名单（含执行岗 dev 与 PMO），手动添加成员时校验，防止脏角色码入库 */
    private static final Set<String> PROJECT_MEMBER_ROLES = Set.of(
            PROJECT_ROLE_PM, PROJECT_ROLE_PRODUCT, PROJECT_ROLE_DEV_LEAD,
            "dev", PROJECT_ROLE_DESIGNER, PROJECT_ROLE_QA, PROJECT_ROLE_OPS, "pmo");

    /**
     * 一个负责人槽位的变更（旧值 → 新值）。
     * <p>用 record 而不是直接传六个参数：创建时旧值恒为 null，编辑时只对「本次提供了该角色」
     * 的槽位发起同步，避免局部更新（暂停/风险开关）误动成员表。
     */
    private record OwnerSlot(String roleCode, Long oldUserId, Long newUserId, String newUserName) {
    }

    private final RdmProjectMapper projectMapper;
    private final RdmProjectMemberMapper memberMapper;
    /** 删除前置校验要跨表计数（需求/迭代），按主键与编码查询，走只读 SQL 而不是另拼 Mapper */
    private final JdbcTemplate jdbcTemplate;
    private final RdmRequirementMapper requirementMapper;
    private final RdmWorkTaskMapper taskMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final RdmAccessGuard accessGuard;
    /** 任务22 统一权威事实源：统计卡片 / 列表行 / 下钻 / 待办 / 导出 / 对账共用同一批事实 */
    private final RdmProjectFactService factService;
    /** 任务21 真实工作日历（含请假/周末支援）：交付清单的逾期工作日数与催办口径必须同源 */
    private final RdmWorkingDayCalculator workingDayCalculator;
    /**
     * 当前操作人姓名解析：rdm_project.updated_by 的写入源。
     * <p>必须由服务层显式赋值：项目的 MetaObjectHandler 只按名字填 createdAt / updatedAt，
     * 不会填 updated_by（同类陷阱已在 hr_leave_request / DocService 上踩过）。
     */
    private final OperatorResolver operatorResolver;

    /* ==================== 查询 ==================== */

    /**
     * 项目分页列表（含交付汇总）；非全量授权者收敛为「我参与的项目」。
     *
     * <p><b>任务22：行与卡同一批事实</b>。列表行改为从 {@link RdmProjectFactService#projectFactPage}
     * 取数（内存切片，{@code total} = 范围内全部事实行数），与统计卡用的是<b>同一个快照</b>，
     * 因此卡片数字恒等于各行相加；旧实现列表走 {@code selectPage}、卡片走另一套 {@code selectList}，
     * 两边条件一旦漂移就出现两个数字。
     *
     * <p><b>行级待裁决不再硬编码 0</b>（旧 {@code applyDeliveryStats} 写死
     * {@code setPendingDecisionCount(0)}，卡片却是真实查询，永远对不上）。
     */
    public Page<RdmProjectVO.ListItem> listProjects(RdmProjectDTO.Query query, Long currentUserId) {
        RdmProjectDTO.Query q = query == null ? new RdmProjectDTO.Query() : query;
        RdmFactVO.FactQuery fact = toFactQuery(q);
        // 下钻只加在列表条件上，不进 toFactQuery：统计卡/导出/对账必须继续走未下钻的全量口径，
        // 否则点一次卡片就把那张卡的数字刷成自己筛出来的值，三张卡之间也失去可比性
        fact.setDrill(q.getDrill());
        Page<RdmFactVO.ProjectFact> factPage =
                factService.projectFactPage(fact, currentUserId, q.getPageNo(), q.getPageSize());
        Page<RdmProjectVO.ListItem> voPage =
                new Page<>(factPage.getCurrent(), factPage.getSize(), factPage.getTotal());
        voPage.setRecords(factPage.getRecords().stream().map(this::toListItem).toList());
        return voPage;
    }

    /** 项目详情（含在途成员与交付汇总） */
    public RdmProjectVO.Detail getProjectDetail(Long id, Long currentUserId) {
        RdmProject project = requireProject(id);
        // A.6 资源守卫：事实源内部 fail-closed 校验（未登录 / 越权他项目一律拒绝）
        RdmFactVO.ProjectFact fact = factService.projectFact(id, currentUserId);
        RdmProjectVO.Detail vo = new RdmProjectVO.Detail();
        vo.setId(project.getId());
        vo.setProjectNo(project.getProjectNo());
        vo.setName(project.getName());
        vo.setObjective(project.getObjective());
        vo.setPmUserName(project.getPmUserName());
        vo.setProductOwnerUserName(project.getProductOwnerUserName());
        vo.setPmUserId(project.getPmUserId());
        vo.setProductOwnerUserId(project.getProductOwnerUserId());
        vo.setTechLeadUserId(project.getTechLeadUserId());
        vo.setTechLeadUserName(project.getTechLeadUserName());
        vo.setUiDesignerUserId(project.getUiDesignerUserId());
        vo.setUiDesignerUserName(project.getUiDesignerUserName());
        vo.setQaLeadUserId(project.getQaLeadUserId());
        vo.setQaLeadUserName(project.getQaLeadUserName());
        vo.setOpsLeadUserId(project.getOpsLeadUserId());
        vo.setOpsLeadUserName(project.getOpsLeadUserName());
        vo.setPlanStartDate(DateTimeUtils.format(project.getPlanStartDate()));
        vo.setPlanEndDate(DateTimeUtils.format(project.getPlanEndDate()));
        vo.setDefaultAcceptancePath(project.getDefaultAcceptancePath());
        vo.setStatus(project.getStatus());
        vo.setPausedFlag(project.getPausedFlag());
        vo.setRiskFlag(project.getRiskFlag());
        vo.setOverdueFlag(project.getOverdueFlag());
        vo.setScopeSummaryJson(project.getScopeSummaryJson());
        vo.setVersion(project.getVersion());
        vo.setCreatedAt(DateTimeUtils.format(project.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(project.getUpdatedAt()));
        vo.setUpdatedBy(project.getUpdatedBy());
        applyFactStats(vo, fact);
        vo.setMembers(loadMembers(id));
        return vo;
    }

    /**
     * 项目交付概览（看板卡片）。
     *
     * <p><b>任务22</b>：新增 {@code currentUserId} 并补资源守卫（A.6）—— 旧签名只校验项目存在，
     * 任何登录用户凭 id 就能读到别人项目的交付概览。全部计数改为消费事实源，与统计卡/列表行同源。
     */
    public RdmProjectVO.Summary getProjectSummary(Long id, Long currentUserId) {
        RdmFactVO.ProjectFact fact = factService.projectFact(id, currentUserId);
        RdmProjectVO.Summary vo = new RdmProjectVO.Summary();
        if (fact == null) {
            return vo;
        }
        vo.setProjectId(fact.getProjectId());
        vo.setProjectName(fact.getProjectName());
        vo.setStatus(fact.getStatus());
        vo.setTotalItems(fact.getDeliveryItemTotal());
        vo.setDeliveredItems(fact.getDeliveryItemCompleted());
        vo.setTestingItems(fact.getDeliveryItemTesting());
        vo.setBlockedItems(fact.getDeliveryItemBlocked());
        vo.setPendingItems(fact.getDeliveryItemPendingAcceptance());
        vo.setOverdueItems(fact.getDeliveryItemOverdue());
        vo.setNextMilestone(fact.getNextDeliveryDate());
        vo.setLastUpdated(fact.getUpdatedAt());
        return vo;
    }

    /**
     * 项目总览统计卡片（口径跟随查询条件）。
     *
     * <p><b>任务22</b>：委派 {@link RdmProjectFactService#cards}，与列表行/导出/对账共用同一个快照。
     * 旧实现在这里另查一次未决问题，与 {@code applyDeliveryStats} 的行级值（硬编码 0）永远对不上。
     */
    public RdmProjectVO.StatsCard getStatsCards(RdmProjectDTO.Query query, Long currentUserId) {
        RdmFactVO.CardSummary cards = factService.cards(toFactQuery(query), currentUserId);
        RdmProjectVO.StatsCard card = new RdmProjectVO.StatsCard();
        card.setInProgressCount(cards.getInProgressCount());
        card.setAttentionCount(cards.getAttentionCount());
        card.setPendingDecisionCount(cards.getPendingDecisionCount());
        card.setTotalProjects(cards.getTotalProjects());
        // 关闭项目 ≠ 交付完成：两者分列，绝不相加
        card.setAllDeliveredProjects(cards.getAllDeliveredProjects());
        card.setClosedProjects(cards.getClosedProjects());
        card.setDeferResidualCount(cards.getDeferResidualCount());
        card.setTodoTotal(cards.getTodoTotal());
        card.setTodoMineCount(cards.getTodoMineCount());
        card.setTodoWaitingOthersCount(cards.getTodoWaitingOthersCount());
        card.setTodoUnassignedCount(cards.getTodoUnassignedCount());
        return card;
    }

    /**
     * 项目待办事项（已去重 + 分三桶）。
     *
     * <p><b>任务22 A.3</b>：待办由 {@link RdmTodoBoardService} 统一计算，按
     * {@code (objectType, refId, responsibleUserId)} 去重，同一对象命中多个成因只算一条；
     * 旧实现对同一交付项分别按「未指派 / 阻塞 / 逾期」各产一条，待办总数虚高。
     *
     * <p><b>任务22 A.4</b>：{@code actionUrl} 一律为前端已注册路由且按对象类型分流，
     * 问题绝不套用交付项地址。
     *
     * <p><b>任务22 A.6</b>：新增 {@code currentUserId} 并补资源守卫 —— 旧签名只校验项目存在，
     * 任何登录用户凭 id 就能读到别人项目的待办。
     */
    public List<RdmProjectVO.PendingItem> getPendingItems(Long projectId, Long currentUserId) {
        RdmFactVO.TodoBoard board = factService.todoBoard(projectId, currentUserId);
        List<RdmProjectVO.PendingItem> result = new ArrayList<>();
        for (RdmFactVO.Todo todo : board.getTodos()) {
            result.add(toPendingItem(todo));
        }
        return result;
    }

    /**
     * 交付清单（按需求分组的交付项）。
     *
     * <p><b>任务22 A.5</b>：{@code testStatus} / {@code acceptanceStatus} 改为消费事实源承载的
     * 任务20 权威结论，<b>不由任务状态推导测试通过、不由交付状态推导验收</b>；
     * 旧 {@code deriveTestStatus} 看「有没有 doing 任务」、{@code deriveAcceptanceStatus} 看
     * 「交付项是不是 done」，两者都是让被门禁的对象自己给自己发通行证。
     *
     * <p><b>任务22 A.6</b>：新增 {@code currentUserId} 并补资源守卫。
     */
    public List<RdmProjectVO.DeliveryChecklist> getDeliveryChecklist(Long projectId, Long currentUserId) {
        List<RdmFactVO.ItemFact> facts = factService.itemFacts(projectId, currentUserId);
        // 按需求分组（保持 reqId 升序，与旧行为一致）；同时取需求标题/编号
        Map<Long, List<RdmFactVO.ItemFact>> byReq = new LinkedHashMap<>();
        for (RdmFactVO.ItemFact fact : facts) {
            if (fact.getReqId() == null) {
                continue;
            }
            byReq.computeIfAbsent(fact.getReqId(), k -> new ArrayList<>()).add(fact);
        }
        List<Long> reqIds = new ArrayList<>(byReq.keySet());
        Map<Long, RdmRequirement> reqById = new HashMap<>();
        if (!reqIds.isEmpty()) {
            // 集合条件 + 空集合守卫：空集合直接不发 SQL
            for (RdmRequirement req : requirementMapper.selectList(
                    new LambdaQueryWrapper<RdmRequirement>().in(RdmRequirement::getId, reqIds))) {
                if (req != null && req.getId() != null) {
                    reqById.put(req.getId(), req);
                }
            }
        }
        List<RdmProjectVO.DeliveryChecklist> result = new ArrayList<>();
        for (Map.Entry<Long, List<RdmFactVO.ItemFact>> e : byReq.entrySet()) {
            RdmRequirement req = reqById.get(e.getKey());
            RdmProjectVO.DeliveryChecklist group = new RdmProjectVO.DeliveryChecklist();
            group.setReqId(e.getKey());
            if (req != null) {
                group.setReqTitle(req.getTitle());
                group.setReqNo(req.getReqNo());
            }
            group.setItems(e.getValue().stream().map(this::toChecklistItem).toList());
            result.add(group);
        }
        return result;
    }

    /**
     * 待办看板（含三桶计数与不变量校验）。
     *
     * <p><b>任务22 A.3</b>：与 {@link #getPendingItems} 同一批事实，额外暴露
     * {@code mineCount / waitingOthersCount / unassignedCount / rawReasonHits}，
     * 使「待我处理」「等待他人」「待分派」三桶与总数满足
     * {@code mine + waitingOthers + unassigned == total}，而 {@code rawReasonHits}
     * 保留去重前的成因命中次数（它 ≥ total 才证明去重真的生效）。
     *
     * <p><b>任务22 A.6</b>：{@code projectId == null} 表示跨项目工作台视角，此时数据范围
     * 仍由事实源 fail-closed 收敛；传入具体 id 时内部做资源守卫，越权他项目一律拒绝。
     */
    public RdmFactVO.TodoBoard getTodoBoard(Long projectId, Long currentUserId) {
        return factService.todoBoard(projectId, currentUserId);
    }

    /**
     * 逐交付项下钻事实（项目 → 交付项明细）。
     *
     * <p><b>任务22 A.1/A.7</b>：下钻行与统计卡出自同一个事实源，因此「卡片合计 = 下钻行相加」
     * 是结构性质而非约定；每行自带任务20 权威结论（{@code testPassed} / {@code productAccepted} /
     * {@code bizAccepted}）、未决问题数、原范围延期残余数与已注册前端路由 {@code actionUrl}。
     */
    public List<RdmFactVO.ItemFact> getItemFacts(Long projectId, Long currentUserId) {
        return factService.itemFacts(projectId, currentUserId);
    }

    /**
     * 全量导出数据包（供任务23 前端 ExcelJS 多 Sheet 导出消费）。
     *
     * <p><b>任务22 A.7</b>：返回的是<b>全量</b>事实（范围内全部项目行 + 全部交付项行 +
     * 全部待办行 + 统计卡 + 对账结论），<b>不是</b>当前页/已加载行 —— 前端只需一次请求即可
     * 生成与页面完全一致的报表，避免「导出只导出了已滚动加载的前 N 行」。
     *
     * <p>数据范围与 {@link #listProjects} 完全一致（同一个 {@code toFactQuery} + 同一个登录人），
     * 因此导出内容不会比页面多出一行越权数据。
     */
    public RdmFactVO.ExportBundle getExportBundle(RdmProjectDTO.Query query, Long currentUserId) {
        return factService.exportBundle(toFactQuery(query), currentUserId);
    }

    /**
     * 对账口径校验（计数一致性自证）。
     *
     * <p><b>任务22 A.1/A.7</b>：两条独立路径互验 —— 路径A 从项目事实行逐项相加，路径B 绕开聚合
     * 直接向库发 {@code selectCount}；两者不等即写入 {@code mismatches} 并置
     * {@code consistent=false}。导出前调用本接口即可证明报表数字可核对，
     * 也用于回归中锁死「卡片=行级=下钻=导出=对账」。
     */
    public RdmFactVO.Reconciliation getReconciliation(RdmProjectDTO.Query query, Long currentUserId) {
        return factService.reconcile(toFactQuery(query), currentUserId);
    }

    /* ==================== 写入 ==================== */

    /** 创建项目，并自动把项目经理加入成员 */
    @Transactional(rollbackFor = Exception.class)
    public RdmProject createProject(RdmProjectDTO.Create dto, Long currentUserId) {
        if (dto == null || !StringUtils.hasText(dto.getName())) {
            throw new BusinessException("項目名稱不能為空");
        }
        RdmProject project = new RdmProject();
        project.setProjectNo(bizSeqService.next(SEQ_PROJECT));
        project.setName(dto.getName().trim());
        project.setObjective(dto.getObjective());
        project.setPmUserId(dto.getPmUserId());
        project.setPmUserName(resolveUserName(dto.getPmUserId(), dto.getPmUserName()));
        project.setProductOwnerUserId(dto.getProductOwnerUserId());
        project.setProductOwnerUserName(resolveUserName(dto.getProductOwnerUserId(), dto.getProductOwnerUserName()));
        project.setTechLeadUserId(dto.getTechLeadUserId());
        project.setTechLeadUserName(resolveUserName(dto.getTechLeadUserId(), dto.getTechLeadUserName()));
        project.setUiDesignerUserId(dto.getUiDesignerUserId());
        project.setUiDesignerUserName(resolveUserName(dto.getUiDesignerUserId(), dto.getUiDesignerUserName()));
        project.setQaLeadUserId(dto.getQaLeadUserId());
        project.setQaLeadUserName(resolveUserName(dto.getQaLeadUserId(), dto.getQaLeadUserName()));
        project.setOpsLeadUserId(dto.getOpsLeadUserId());
        project.setOpsLeadUserName(resolveUserName(dto.getOpsLeadUserId(), dto.getOpsLeadUserName()));
        project.setPlanStartDate(parseDate(dto.getPlanStartDate(), "計劃開始日期"));
        project.setPlanEndDate(parseDate(dto.getPlanEndDate(), "計劃結束日期"));
        project.setDefaultAcceptancePath(normalizePath(dto.getDefaultAcceptancePath()));
        project.setStatus(RdmConstants.PROJECT_PREPARING);
        project.setPausedFlag(0);
        project.setRiskFlag(0);
        project.setOverdueFlag(0);
        // 新建即「最后一次更新」：不写创建人，列表上刚建的项目会显示「没人改过」
        project.setUpdatedBy(operatorResolver.currentOperatorName());
        projectMapper.insert(project);
        log.info("創建 RDM 項目成功: id={}, no={}, operator={}", project.getId(), project.getProjectNo(), currentUserId);

        // 六类负责人全部入组：成员表是数据范围/负载/权限的事实源，只写主表的负责人在详情
        // 「項目成員」里看不到，也进不了自己负责的项目（requireProjectMember 会把本人挡住）。
        // 同一人兼任多角色时按「一人一角色一行」写入（uk_project_user_role 口径）。
        syncOwnerMembers(project.getId(), List.of(
                new OwnerSlot(PROJECT_ROLE_PM, null, project.getPmUserId(), project.getPmUserName()),
                new OwnerSlot(PROJECT_ROLE_PRODUCT, null, project.getProductOwnerUserId(), project.getProductOwnerUserName()),
                new OwnerSlot(PROJECT_ROLE_DEV_LEAD, null, project.getTechLeadUserId(), project.getTechLeadUserName()),
                new OwnerSlot(PROJECT_ROLE_DESIGNER, null, project.getUiDesignerUserId(), project.getUiDesignerUserName()),
                new OwnerSlot(PROJECT_ROLE_QA, null, project.getQaLeadUserId(), project.getQaLeadUserName()),
                new OwnerSlot(PROJECT_ROLE_OPS, null, project.getOpsLeadUserId(), project.getOpsLeadUserName())));
        return project;
    }

    /** 编辑项目（乐观锁：expectedVersion 不匹配即拒绝） */
    @Transactional(rollbackFor = Exception.class)
    public void updateProject(Long id, RdmProjectDTO.Update dto, Long currentUserId) {
        RdmProject project = requireProject(id);
        accessGuard.requireProjectMember(id, currentUserId);
        if (dto == null) {
            throw new BusinessException("請求體不能為空");
        }
        if (dto.getExpectedVersion() == null || !dto.getExpectedVersion().equals(project.getVersion())) {
            throw new BusinessException("項目已被他人修改，請刷新後重試");
        }
        // 同步成员表要用「变更前」的负责人判定谁该退出，必须在下面覆盖字段之前先留存
        Long oldPmUserId = project.getPmUserId();
        Long oldProductOwnerUserId = project.getProductOwnerUserId();
        Long oldTechLeadUserId = project.getTechLeadUserId();
        Long oldUiDesignerUserId = project.getUiDesignerUserId();
        Long oldQaLeadUserId = project.getQaLeadUserId();
        Long oldOpsLeadUserId = project.getOpsLeadUserId();
        if (StringUtils.hasText(dto.getName())) {
            project.setName(dto.getName().trim());
        }
        if (dto.getObjective() != null) {
            project.setObjective(dto.getObjective());
        }
        // 项目经理与产品负责人同样以「userName 非 null」为提供哨兵（与技/设/测/运四组一致）：
        // 旧写法 if (pmUserId != null) 是 null-skip，表单清空负责人时 ID 传 null 会被跳过，
        // 永远清不掉。表单恒传字符串（清空传 ''），局部更新（暂停/风险）不带这些 key 则整体跳过。
        if (dto.getPmUserName() != null) {
            project.setPmUserId(dto.getPmUserId());
            project.setPmUserName(resolveUserName(dto.getPmUserId(), dto.getPmUserName()));
        }
        if (dto.getProductOwnerUserName() != null) {
            project.setProductOwnerUserId(dto.getProductOwnerUserId());
            project.setProductOwnerUserName(
                    resolveUserName(dto.getProductOwnerUserId(), dto.getProductOwnerUserName()));
        }
        // 四组负责人以「userName 非 null」为提供哨兵：表单恒传字符串（清空传空串），
        // 支持清空；暂停/风险等局部更新不传这些 key，不会误清
        if (dto.getTechLeadUserName() != null) {
            project.setTechLeadUserId(dto.getTechLeadUserId());
            project.setTechLeadUserName(resolveUserName(dto.getTechLeadUserId(), dto.getTechLeadUserName()));
        }
        if (dto.getUiDesignerUserName() != null) {
            project.setUiDesignerUserId(dto.getUiDesignerUserId());
            project.setUiDesignerUserName(resolveUserName(dto.getUiDesignerUserId(), dto.getUiDesignerUserName()));
        }
        if (dto.getQaLeadUserName() != null) {
            project.setQaLeadUserId(dto.getQaLeadUserId());
            project.setQaLeadUserName(resolveUserName(dto.getQaLeadUserId(), dto.getQaLeadUserName()));
        }
        if (dto.getOpsLeadUserName() != null) {
            project.setOpsLeadUserId(dto.getOpsLeadUserId());
            project.setOpsLeadUserName(resolveUserName(dto.getOpsLeadUserId(), dto.getOpsLeadUserName()));
        }
        if (dto.getPlanStartDate() != null) {
            project.setPlanStartDate(parseDate(dto.getPlanStartDate(), "計劃開始日期"));
        }
        if (dto.getPlanEndDate() != null) {
            project.setPlanEndDate(parseDate(dto.getPlanEndDate(), "計劃結束日期"));
        }
        if (StringUtils.hasText(dto.getDefaultAcceptancePath())) {
            project.setDefaultAcceptancePath(normalizePath(dto.getDefaultAcceptancePath()));
        }
        if (StringUtils.hasText(dto.getStatus())) {
            project.setStatus(dto.getStatus());
        }
        if (dto.getPausedFlag() != null) {
            project.setPausedFlag(dto.getPausedFlag());
        }
        if (dto.getRiskFlag() != null) {
            project.setRiskFlag(dto.getRiskFlag());
        }
        // 每次成功写入都刷新操作人快照：暂停/恢复等开关型更新也算「谁最后改的」
        project.setUpdatedBy(operatorResolver.currentOperatorName());
        // @Version 由 MyBatis-Plus 自动 +1 并作为 WHERE 条件；受影响行数为 0 说明并发覆盖
        if (projectMapper.updateById(project) == 0) {
            throw new BusinessException("項目已被他人修改，請刷新後重試");
        }
        // 负责人变更同步成员表：只对本次提供了该角色的槽位生效（userName 非 null 即已提供），
        // 否则暂停/风险等局部更新会把没带 key 的角色误判为「清空」。
        List<OwnerSlot> slots = new ArrayList<>();
        if (dto.getPmUserName() != null) {
            slots.add(new OwnerSlot(PROJECT_ROLE_PM, oldPmUserId, project.getPmUserId(), project.getPmUserName()));
        }
        if (dto.getProductOwnerUserName() != null) {
            slots.add(new OwnerSlot(PROJECT_ROLE_PRODUCT, oldProductOwnerUserId,
                    project.getProductOwnerUserId(), project.getProductOwnerUserName()));
        }
        if (dto.getTechLeadUserName() != null) {
            slots.add(new OwnerSlot(PROJECT_ROLE_DEV_LEAD, oldTechLeadUserId,
                    project.getTechLeadUserId(), project.getTechLeadUserName()));
        }
        if (dto.getUiDesignerUserName() != null) {
            slots.add(new OwnerSlot(PROJECT_ROLE_DESIGNER, oldUiDesignerUserId,
                    project.getUiDesignerUserId(), project.getUiDesignerUserName()));
        }
        if (dto.getQaLeadUserName() != null) {
            slots.add(new OwnerSlot(PROJECT_ROLE_QA, oldQaLeadUserId,
                    project.getQaLeadUserId(), project.getQaLeadUserName()));
        }
        if (dto.getOpsLeadUserName() != null) {
            slots.add(new OwnerSlot(PROJECT_ROLE_OPS, oldOpsLeadUserId,
                    project.getOpsLeadUserId(), project.getOpsLeadUserName()));
        }
        syncOwnerMembers(id, slots);
        log.info("更新 RDM 項目: id={}, operator={}", id, currentUserId);
    }

    /**
     * 删除项目（仅限未挂任何需求的空壳项目）。
     *
     * <p><b>口径</b>：项目下（含挂在该项目迭代上的）需求一条都不能有；通过校验后，
     * 项目下<b>未挂需求的迭代一并逻辑删除</b> —— 项目已被删除，留在列表里的迭代会变成
     * 无法归属的孤儿行，且 sprint/version 又不允许置空项目。
     *
     * <p><b>为什么物理删项目</b>：{@code rdm_project} 建表时就没有 {@code deleted} 列，
     * 全仓有十几处手写 SQL 直接 {@code SELECT ... FROM rdm_project}。补逻辑删不仅要改实体，
     * 还要逐处补过滤，漏一处就出现「已删除但列表仍能查到」的幽灵项目；
     * 而本方法的前置条件已经把业务数据清空，物理删的损失只有成员行（随即一并清理）。
     *
     * <p>权限：菜单动作（{@code delete}）在控制器校验，这里只做资源归属守卫，
     * 与 {@link #updateProject} 同口径（项目成员或管理员）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteProject(Long id, Long currentUserId) {
        RdmProject project = requireProject(id);
        accessGuard.requireProjectMember(id, currentUserId);
        /*
         * 需求归属有两条线：直接挂 project_id，或只挂迭代编码（iteration_code）。
         * 只查 project_id 会漏掉「迭代已挂项目、需求只写了迭代编码」的存量行，
         * 一旦删项目，这些需求就失去所属项目。
         */
        Integer reqCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_requirement WHERE deleted = 0 AND (project_id = ? "
                        + "OR iteration_code IN (SELECT code FROM rdm_iteration WHERE project_id = ? AND deleted = 0))",
                Integer.class, id, id);
        if (reqCount != null && reqCount > 0) {
            throw new BusinessException("該項目下仍有 " + reqCount + " 條需求，請先移除或轉移需求後再刪除");
        }
        // 迭代随项目逻辑删除：项目已不存在，迭代列表不应再出现无法归属的行
        int removedIterations = jdbcTemplate.update(
                "UPDATE rdm_iteration SET deleted = 1, updated_by = ?, updated_at = NOW() "
                        + "WHERE project_id = ? AND deleted = 0",
                operatorResolver.operatorSignature(operatorResolver.currentUser()), id);
        // 成员行没有 deleted 列，项目删除后不再被任何查询引用，物理清理
        memberMapper.delete(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getProjectId, id));
        projectMapper.deleteById(id);
        log.info("刪除 RDM 項目: id={}, projectNo={}, 級聯迭代={}, operator={}",
                id, project.getProjectNo(), removedIterations, currentUserId);
    }

    /** 添加项目成员 */
    @Transactional(rollbackFor = Exception.class)
    public void addMember(Long projectId, RdmProjectDTO.MemberAdd dto, Long currentUserId) {
        requireProject(projectId);
        accessGuard.requireProjectMember(projectId, currentUserId);
        if (dto == null || dto.getUserId() == null) {
            throw new BusinessException("成員用戶不能為空");
        }
        if (!StringUtils.hasText(dto.getRoleCode())) {
            throw new BusinessException("成員角色不能為空");
        }
        // 角色码归一化到小写并校验白名单：前端历史上传过 'DEV' 这类大写值，大小写混存会让
        // 按角色统计/映射全部漏算；不在白名单的码一律拒绝，不落库
        String roleCode = dto.getRoleCode().trim().toLowerCase();
        if (!PROJECT_MEMBER_ROLES.contains(roleCode)) {
            throw new BusinessException("成員角色不合法");
        }
        // 同项目同人同角色唯一（uk_project_user_role）；已在组则拒绝，避免重复计数
        Long dup = memberMapper.selectCount(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getProjectId, projectId)
                .eq(RdmProjectMember::getUserId, dto.getUserId())
                .eq(RdmProjectMember::getRoleCode, roleCode)
                .isNull(RdmProjectMember::getLeaveTime));
        if (dup != null && dup > 0) {
            throw new BusinessException("該成員已在項目中");
        }
        RdmProjectMember member = new RdmProjectMember();
        member.setProjectId(projectId);
        member.setUserId(dto.getUserId());
        member.setEmpNo(dto.getEmpNo());
        member.setUserName(resolveUserName(dto.getUserId(), dto.getUserName()));
        member.setRoleCode(roleCode);
        member.setJoinTime(LocalDateTime.now());
        memberMapper.insert(member);
        log.info("添加 RDM 項目成員: projectId={}, userId={}, role={}, operator={}",
                projectId, dto.getUserId(), roleCode, currentUserId);
    }

    /** 移除项目成员（软移除：置 leave_time，保留历史参与） */
    @Transactional(rollbackFor = Exception.class)
    public void removeMember(Long projectId, Long userId, Long currentUserId) {
        requireProject(projectId);
        accessGuard.requireProjectMember(projectId, currentUserId);
        if (userId == null) {
            throw new BusinessException("成員用戶不能為空");
        }
        List<RdmProjectMember> actives = memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getProjectId, projectId)
                .eq(RdmProjectMember::getUserId, userId)
                .isNull(RdmProjectMember::getLeaveTime));
        if (actives.isEmpty()) {
            throw new BusinessException("該成員不在項目中");
        }
        LocalDateTime now = LocalDateTime.now();
        for (RdmProjectMember m : actives) {
            m.setLeaveTime(now);
            memberMapper.updateById(m);
        }
        log.info("移除 RDM 項目成員: projectId={}, userId={}, operator={}", projectId, userId, currentUserId);
    }

    /**
     * 负责人变更同步到项目成员表（创建/编辑共用）。
     *
     * <p>为什么必须同步：{@code rdm_project_member} 是数据范围（{@link RdmAccessGuard}）、
     * 团队负载与详情「項目成員」的唯一事实源；只把负责人写进主表时，详情页成员为空，
     * 负责人本人也进不了自己负责的项目。
     *
     * <p>一人一角色一行（{@code uk_project_user_role} 口径）：同一人兼任 PM 与产品时写两行，
     * 因此换人只需软移除「该角色」那一行，不会误伤其其他角色。
     */
    private void syncOwnerMembers(Long projectId, List<OwnerSlot> slots) {
        if (projectId == null || slots == null || slots.isEmpty()) {
            return;
        }
        for (OwnerSlot slot : slots) {
            if (slot.oldUserId() != null && !Objects.equals(slot.oldUserId(), slot.newUserId())) {
                deactivateMember(projectId, slot.oldUserId(), slot.roleCode());
            }
            if (slot.newUserId() != null) {
                activateMember(projectId, slot.newUserId(), slot.newUserName(), slot.roleCode());
            }
        }
    }

    /** 软移除某人在项目中的某个角色（保留历史参与，与 removeMember 同一口径） */
    private void deactivateMember(Long projectId, Long userId, String roleCode) {
        List<RdmProjectMember> actives = memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getProjectId, projectId)
                .eq(RdmProjectMember::getUserId, userId)
                .eq(RdmProjectMember::getRoleCode, roleCode)
                .isNull(RdmProjectMember::getLeaveTime));
        if (actives == null || actives.isEmpty()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        for (RdmProjectMember m : actives) {
            m.setLeaveTime(now);
            memberMapper.updateById(m);
        }
    }

    /**
     * 成员入组：不存在则插入，曾离开（软删）过则复活同一行。
     * <p>必须复活而不是重新插入：唯一键 {@code uk_project_user_role} 不区分 leave_time，
     * 离任过的负责人在库里已经占着那一行，直接 insert 会撞唯一键，整个项目写入回滚。
     */
    private void activateMember(Long projectId, Long userId, String userName, String roleCode) {
        RdmProjectMember existing = memberMapper.selectOne(new LambdaQueryWrapper<RdmProjectMember>()
                .eq(RdmProjectMember::getProjectId, projectId)
                .eq(RdmProjectMember::getUserId, userId)
                .eq(RdmProjectMember::getRoleCode, roleCode));
        if (existing == null) {
            RdmProjectMember member = new RdmProjectMember();
            member.setProjectId(projectId);
            member.setUserId(userId);
            member.setUserName(userName);
            member.setRoleCode(roleCode);
            member.setJoinTime(LocalDateTime.now());
            memberMapper.insert(member);
            return;
        }
        boolean rejoined = existing.getLeaveTime() != null;
        boolean renamed = !Objects.equals(existing.getUserName(), userName);
        if (!rejoined && !renamed) {
            return;
        }
        existing.setUserName(userName);
        if (rejoined) {
            existing.setLeaveTime(null);
            existing.setJoinTime(LocalDateTime.now());
        }
        memberMapper.updateById(existing);
    }

    /* ==================== 内部工具 ==================== */

    private RdmProject requireProject(Long id) {
        RdmProject project = id == null ? null : projectMapper.selectById(id);
        if (project == null) {
            throw new BusinessException("項目不存在或已刪除");
        }
        return project;
    }

    /**
     * 把页面查询条件投影为事实源查询条件。
     * <p>列表与统计卡<b>必须走同一组 filters</b>（前端 UI 规范 §E.8），因此两边都由本方法转换，
     * 绝不允许各自拼条件 —— 那正是「卡片显示全量、列表已筛选」口径错位的成因。
     */
    private RdmFactVO.FactQuery toFactQuery(RdmProjectDTO.Query query) {
        RdmProjectDTO.Query q = query == null ? new RdmProjectDTO.Query() : query;
        RdmFactVO.FactQuery fact = new RdmFactVO.FactQuery();
        fact.setKeyword(q.getKeyword());
        fact.setStatus(q.getStatus());
        fact.setPmUserId(q.getPmUserId());
        fact.setProductOwnerUserId(q.getProductOwnerUserId());
        fact.setPlanDateFrom(q.getPlanDateFrom());
        fact.setPlanDateTo(q.getPlanDateTo());
        fact.setIncludeTodos(true);
        fact.setIncludeItems(true);
        return fact;
    }

    private List<RdmProjectVO.MemberItem> loadMembers(Long projectId) {
        return memberMapper.selectList(new LambdaQueryWrapper<RdmProjectMember>()
                        .eq(RdmProjectMember::getProjectId, projectId)
                        .isNull(RdmProjectMember::getLeaveTime)
                        .orderByAsc(RdmProjectMember::getJoinTime))
                .stream().map(m -> {
                    RdmProjectVO.MemberItem vo = new RdmProjectVO.MemberItem();
                    vo.setId(m.getId());
                    vo.setUserId(m.getUserId());
                    vo.setEmpNo(m.getEmpNo());
                    vo.setUserName(m.getUserName());
                    vo.setRoleCode(m.getRoleCode());
                    vo.setJoinTime(DateTimeUtils.format(m.getJoinTime()));
                    return vo;
                }).toList();
    }

    /** 项目事实 → 列表行（全部计数直接搬事实，不再另算一套） */
    private RdmProjectVO.ListItem toListItem(RdmFactVO.ProjectFact fact) {
        RdmProjectVO.ListItem vo = new RdmProjectVO.ListItem();
        vo.setId(fact.getProjectId());
        vo.setProjectNo(fact.getProjectNo());
        vo.setName(fact.getProjectName());
        vo.setObjective(fact.getObjective());
        vo.setPmUserName(fact.getPmUserName());
        vo.setPmUserEmpNo(fact.getPmUserEmpNo());
        vo.setProductOwnerUserName(fact.getProductOwnerUserName());
        vo.setProductOwnerUserEmpNo(fact.getProductOwnerUserEmpNo());
        vo.setPlanStartDate(fact.getPlanStartDate());
        vo.setPlanEndDate(fact.getPlanEndDate());
        vo.setStatus(fact.getStatus());
        vo.setPausedFlag(fact.getPausedFlag());
        vo.setRiskFlag(fact.getRiskFlag());
        vo.setOverdueFlag(fact.getOverdueFlag());
        vo.setUpdatedAt(fact.getUpdatedAt());
        vo.setUpdatedBy(fact.getUpdatedBy());
        vo.setDeliveredCount(fact.getDeliveryItemCompleted());
        vo.setTotalDeliveryCount(fact.getDeliveryItemTotal());
        // 需求数与研发任务数直接搬事实源：列表「交付進度」列要同时展示这三层进度，
        // 任何一处前端另算都会出现「卡片≠行级导出」（任务22 的同源红线）
        vo.setRequirementTotal(fact.getRequirementTotal());
        vo.setTaskTotal(fact.getTaskTotal());
        vo.setTaskCompleted(fact.getTaskCompleted());
        vo.setBlockedCount(fact.getDeliveryItemBlocked());
        vo.setNextDeliveryDate(fact.getNextDeliveryDate());
        // 逾期标记随汇总刷新（有未完成项已过计划结束日即视为逾期）
        if (fact.getDeliveryItemOverdue() > 0) {
            vo.setOverdueFlag(1);
        }
        // 行级「待裁决」与卡片同口径：旧实现硬编码 0，卡片却是真实查询，两者永远对不上
        vo.setPendingDecisionCount(fact.getPendingDecisionCount());
        return vo;
    }

    /** 项目事实 → 详情汇总（与列表行走同一段搬数逻辑，两者不可能不一致） */
    private void applyFactStats(RdmProjectVO.Detail vo, RdmFactVO.ProjectFact fact) {
        if (fact == null) {
            vo.setDeliveredCount(0);
            vo.setTotalDeliveryCount(0);
            vo.setBlockedCount(0);
            vo.setPendingDecisionCount(0);
            return;
        }
        vo.setDeliveredCount(fact.getDeliveryItemCompleted());
        vo.setTotalDeliveryCount(fact.getDeliveryItemTotal());
        vo.setBlockedCount(fact.getDeliveryItemBlocked());
        vo.setNextDeliveryDate(fact.getNextDeliveryDate());
        vo.setPendingDecisionCount(fact.getPendingDecisionCount());
        if (fact.getDeliveryItemOverdue() > 0) {
            vo.setOverdueFlag(1);
        }
    }

    /**
     * 待办事实 → 页面待办行。
     * <p>{@code type} 取<b>首要成因</b>（按固定优先级），全部成因放 {@code reasons}；
     * 旧实现把一个交付项的三个成因拆成三行，待办总数因此虚高。
     * <p>{@code actionUrl} 直接搬事实源的已注册路由，<b>不在这里重拼</b> ——
     * 两处拼路由是历史上「问题套用交付项地址」的成因。
     */
    private RdmProjectVO.PendingItem toPendingItem(RdmFactVO.Todo todo) {
        RdmProjectVO.PendingItem item = new RdmProjectVO.PendingItem();
        item.setType(primaryReason(todo.getReasons()));
        item.setRefId(todo.getRefId());
        item.setRefNo(todo.getRefNo());
        item.setTitle(todo.getTitle());
        item.setResponsibleName(todo.getResponsibleName());
        item.setResponsibleUserId(todo.getResponsibleUserId());
        item.setDueDate(todo.getDueDate());
        item.setObjectType(todo.getObjectType());
        item.setBucket(todo.getBucket());
        item.setReasons(todo.getReasons() == null ? new ArrayList<>() : new ArrayList<>(todo.getReasons()));
        item.setOverdue(todo.isOverdue());
        item.setOverdueWorkingDays(todo.getOverdueWorkingDays());
        item.setActionUrl(todo.getActionUrl());
        return item;
    }

    /** 首要成因优先级：需要人裁决的事优先于单纯逾期，逾期优先于未指派/阻塞等推进类成因。 */
    private static String primaryReason(List<String> reasons) {
        if (reasons == null || reasons.isEmpty()) {
            return null;
        }
        for (String preferred : List.of(
                RdmConstants.TODO_REASON_PENDING_DECISION,
                RdmConstants.TODO_REASON_DEFER_RESIDUAL,
                RdmConstants.TODO_REASON_PENDING_PRODUCT_ACCEPTANCE,
                RdmConstants.TODO_REASON_PENDING_BIZ_ACCEPTANCE,
                RdmConstants.TODO_REASON_TEST_NOT_PASSED,
                RdmConstants.TODO_REASON_BLOCKED,
                RdmConstants.TODO_REASON_OVERDUE,
                RdmConstants.TODO_REASON_UNASSIGNED)) {
            if (reasons.contains(preferred)) {
                return preferred;
            }
        }
        return reasons.get(0);
    }

    /**
     * 交付项事实 → 交付清单行。
     *
     * <p><b>A.5：不由任务状态推导测试通过、不由交付状态推导验收</b>。
     * {@code testStatus=passed} 当且仅当事实源承载的任务20 {@code isTestPassed} 为真；
     * {@code acceptanceStatus=passed} 当且仅当产品<b>且</b>业务验收权威结论均为通过。
     * 旧实现：{@code deriveTestStatus} 看「有没有 doing 任务」、{@code deriveAcceptanceStatus} 看
     * 「交付项是不是 done」—— 后者尤其危险：交付项 done 只需发布完成，未经任何签署也会显示「已验收」。
     */
    private RdmProjectVO.ChecklistItem toChecklistItem(RdmFactVO.ItemFact fact) {
        RdmProjectVO.ChecklistItem vo = new RdmProjectVO.ChecklistItem();
        vo.setItemId(fact.getItemId());
        vo.setItemNo(fact.getItemNo());
        vo.setTitle(fact.getTitle());
        vo.setCoordinatorName(fact.getCoordinatorUserName());
        vo.setStatus(fact.getStatus());
        vo.setPlanEndDate(fact.getPlanEndDate());
        vo.setScopeVersion(fact.getScopeVersion());
        vo.setPendingDecisionCount(fact.getPendingDecisionCount());
        vo.setDeferResidualCount(fact.getDeferResidualCount());
        vo.setProductAcceptancePassed(fact.isProductAccepted());
        vo.setBizAcceptancePassed(fact.isBizAccepted());
        vo.setActionUrl(fact.getActionUrl());

        if (fact.isTestPassed()) {
            vo.setTestStatus("passed");
        } else if (RdmConstants.DI_TESTING.equals(fact.getStatus())) {
            // 仅表示「处于测试环节」，绝不表示已通过
            vo.setTestStatus(RdmConstants.DI_TESTING);
        }
        if (fact.isProductAccepted() && fact.isBizAccepted()) {
            vo.setAcceptanceStatus("passed");
        } else if (RdmTodoBoardService.isReachedAcceptanceStage(fact)) {
            vo.setAcceptanceStatus("pending");
        }
        if (fact.isBlocked()) {
            vo.setBlockedReason(resolveBlockedReason(fact.getItemId()));
        }
        if (fact.isOverdue() && fact.getPlanEndDate() != null) {
            LocalDate due = parseFactDate(fact.getPlanEndDate());
            if (due != null) {
                vo.setOverdueWorkingDays(
                        workingDayCalculator.overdueWorkingDays(due, LocalDate.now(), fact.getCoordinatorUserId()));
            }
        }
        return vo;
    }

    private static LocalDate parseFactDate(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            String trimmed = value.trim();
            return LocalDate.parse(trimmed.substring(0, Math.min(10, trimmed.length())));
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** 阻塞原因：取该交付项下最近一条 blocked 任务的说明 */
    private String resolveBlockedReason(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return null;
        }
        List<RdmWorkTask> blocked = taskMapper.selectList(new LambdaQueryWrapper<RdmWorkTask>()
                .eq(RdmWorkTask::getDeliveryItemId, deliveryItemId)
                .eq(RdmWorkTask::getStatus, "blocked")
                .orderByDesc(RdmWorkTask::getUpdatedAt)
                .last("LIMIT 1"));
        return blocked.isEmpty() ? null : blocked.get(0).getBlockedReason();
    }

    private String resolveUserName(Long userId, String fallback) {
        if (StringUtils.hasText(fallback)) {
            return fallback;
        }
        if (userId == null) {
            return null;
        }
        SysUser user = userMapper.selectById(userId);
        return user == null ? null : user.getName();
    }

    private String normalizePath(String path) {
        return RdmConstants.PATH_B.equalsIgnoreCase(path) ? RdmConstants.PATH_B : RdmConstants.PATH_A;
    }

    private LocalDate parseDate(String value, String fieldName) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException(fieldName + "格式不正確，應為 yyyy-MM-dd");
        }
    }
}
