package com.mftb.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmFactVO;
import com.mftb.admin.dto.RdmProjectDTO;
import com.mftb.admin.dto.RdmProjectRequirementVO;
import com.mftb.admin.dto.RdmProjectVO;
import com.mftb.admin.entity.RdmProject;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmAllowedActionsService;
import com.mftb.admin.service.RdmProjectService;
import com.mftb.admin.service.RdmProjectRequirementBoardService;
import com.mftb.admin.service.RdmTodoNotifyService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 產研交付（RDM）项目总览接口（Batch 1）。
 * <p>菜单归属：{@code rdm-dashboard-project}。数据范围由服务层按登录人收敛
 * （非全量授权者只看「我参与的项目」），控制器只负责鉴权注解、取当前操作人与结果封装。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/project")
@RequiredArgsConstructor
public class RdmProjectController {

    private final RdmProjectService projectService;
    /** 项目详情「迭代 → 需求」视角：交付清单/待推进/进度卡的新口径（与交付项事实源并存） */
    private final RdmProjectRequirementBoardService requirementBoardService;
    private final RdmAllowedActionsService allowedActionsService;
    private final OperatorResolver operatorResolver;
    /** 任务22 B：手动催办（工作日口径 + 提醒日去重 + executeOnce 幂等） */
    private final RdmTodoNotifyService todoNotifyService;
    /** 任务22 A.6：资源守卫。allowedActions 只供 UI 渲染，后端每个写端点独立重鉴权 */
    private final RdmAccessGuard accessGuard;

    /* ==================== 查询 ==================== */

    /** 项目分页列表（含交付汇总） */
    @GetMapping
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<PageResult<RdmProjectVO.ListItem>> listProjects(RdmProjectDTO.Query query) {
        Page<RdmProjectVO.ListItem> page = projectService.listProjects(query, currentUserId());
        return Result.success(new PageResult<>(page.getRecords(), page.getTotal()));
    }

    /**
     * 项目总览统计卡片。
     * <p>口径跟随列表查询条件（与 {@link #listProjects} 同一组 filters），
     * 而非绑定单个项目 id —— 统计卡必须反映当前筛选结果（见前端 UI 规范 §E.8），
     * 故按 {@code RdmProjectDTO.Query} 取数，服务层同样按登录人收敛数据范围。
     */
    @GetMapping("/stats")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<RdmProjectVO.StatsCard> getStatsCards(RdmProjectDTO.Query query) {
        return Result.success(projectService.getStatsCards(query, currentUserId()));
    }

    /** 项目详情（含在途成员与交付汇总） */
    @GetMapping("/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<RdmProjectVO.Detail> getProjectDetail(@PathVariable Long id) {
        return Result.success(projectService.getProjectDetail(id, currentUserId()));
    }

    /**
     * 项目可执行动作（按钮口径的单一真相源）。
     * <p>前端详情页/列表行按此列表渲染按钮，避免各自拼 {@code if status==... && role==...}
     * 导致「按钮能点但接口 403」的错位；真实强校验仍由写接口的 access guard 兜底。
     */
    @GetMapping("/{id}/actions")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<List<RdmAllowedActionsService.AllowedAction>> getProjectActions(@PathVariable Long id) {
        return Result.success(allowedActionsService.computeProjectActions(id, currentUserId()));
    }

    /** 项目交付概览（看板卡片） */
    @GetMapping("/{id}/summary")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<RdmProjectVO.Summary> getProjectSummary(@PathVariable Long id) {
        return Result.success(projectService.getProjectSummary(id, currentUserId()));
    }

    /** 项目待办事项（未分配/阻塞/待决策/逾期） */
    @GetMapping("/{id}/pending")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<List<RdmProjectVO.PendingItem>> getPendingItems(@PathVariable Long id) {
        return Result.success(projectService.getPendingItems(id, currentUserId()));
    }

    /** 交付清单（按需求分组的交付项） */
    @GetMapping("/{id}/checklist")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<List<RdmProjectVO.DeliveryChecklist>> getDeliveryChecklist(@PathVariable Long id) {
        return Result.success(projectService.getDeliveryChecklist(id, currentUserId()));
    }

    /**
     * 项目需求视角（迭代 → 需求 + 需求/任务口径待办 + 双口径概览）。
     * <p>取代项目详情对 {@code /checklist}（仅交付项）的单一口径：需求未准入/未拆交付项时，
     * 旧接口返回空列表，项目看起来“什么都没挂”。
     */
    @GetMapping("/{id}/requirement-board")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<RdmProjectRequirementVO.Board> getRequirementBoard(@PathVariable Long id) {
        return Result.success(requirementBoardService.getBoard(id, currentUserId()));
    }

    /* ==================== 任务22 A：待办看板 / 下钻 / 导出 / 对账 ==================== */

    /**
     * 待办看板（已去重 + 三桶计数 + 不变量）。
     * <p>{@code id} 传 {@code 0} 表示跨项目工作台视角（路径变量无法为空，故用 0 作哨兵）；
     * 两种情形都由事实源 fail-closed 收敛数据范围，越权他项目直接拒绝。
     */
    @GetMapping("/{id}/todo-board")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<RdmFactVO.TodoBoard> getTodoBoard(@PathVariable Long id) {
        return Result.success(projectService.getTodoBoard(normalizeProjectId(id), currentUserId()));
    }

    /** 逐交付项下钻事实（与统计卡/导出同源，卡片合计恒等于下钻行相加） */
    @GetMapping("/{id}/item-facts")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<List<RdmFactVO.ItemFact>> getItemFacts(@PathVariable Long id) {
        return Result.success(projectService.getItemFacts(id, currentUserId()));
    }

    /**
     * 全量导出数据包（供前端 ExcelJS 多 Sheet 导出消费）。
     * <p>返回范围内<b>全量</b>项目行 + 交付项行 + 待办行 + 统计卡 + 对账结论，
     * <b>非</b>当前页/已加载行；筛选条件与 {@link #listProjects} 同一组，不会多出越权数据。
     */
    @GetMapping("/export-bundle")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<RdmFactVO.ExportBundle> getExportBundle(RdmProjectDTO.Query query) {
        return Result.success(projectService.getExportBundle(query, currentUserId()));
    }

    /** 对账口径校验（路径A 逐行相加 vs 路径B 直接查库，不等即列 mismatches） */
    @GetMapping("/reconciliation")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "view")
    public Result<RdmFactVO.Reconciliation> getReconciliation(RdmProjectDTO.Query query) {
        return Result.success(projectService.getReconciliation(query, currentUserId()));
    }

    /* ==================== 写入 ==================== */

    /** 创建项目（自动把项目经理加入成员） */
    @PostMapping
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "create")
    public Result<RdmProject> createProject(@RequestBody RdmProjectDTO.Create dto) {
        RdmProject project = projectService.createProject(dto, currentUserId());
        log.info("RDM 项目已创建: id={}, name={}, operator={}",
                project.getId(), project.getName(), operatorResolver.currentOperatorName());
        return Result.success("項目已創建", project);
    }

    /** 编辑项目（乐观锁，expectedVersion 不匹配即拒绝） */
    @PatchMapping("/{id}")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "edit")
    public Result<Void> updateProject(@PathVariable Long id, @RequestBody RdmProjectDTO.Update dto) {
        projectService.updateProject(id, dto, currentUserId());
        log.info("RDM 项目已更新: id={}, operator={}", id, operatorResolver.currentOperatorName());
        return Result.success("項目已更新", null);
    }

    /** 添加项目成员 */
    @PostMapping("/{id}/members")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "edit")
    public Result<Void> addMember(@PathVariable Long id, @RequestBody RdmProjectDTO.MemberAdd dto) {
        projectService.addMember(id, dto, currentUserId());
        log.info("RDM 项目成员已添加: projectId={}, userId={}, role={}, operator={}",
                id, dto == null ? null : dto.getUserId(), dto == null ? null : dto.getRoleCode(),
                operatorResolver.currentOperatorName());
        return Result.success("成員已添加", null);
    }

    /** 移除项目成员 */
    @DeleteMapping("/{id}/members/{userId}")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "edit")
    public Result<Void> removeMember(@PathVariable Long id, @PathVariable Long userId) {
        projectService.removeMember(id, userId, currentUserId());
        log.info("RDM 项目成员已移除: projectId={}, userId={}, operator={}",
                id, userId, operatorResolver.currentOperatorName());
        return Result.success("成員已移除", null);
    }

    /**
     * 手动催办项目待办（任务22 B.4）。
     *
     * <p>催办对象只包含<b>逾期达門檻</b>的待办，且逐人过真实工作日历闸门（请假/周末/调休不催）；
     * 同一提醒日同一对象同一接收人只催一次（{@code DATE:yyyy-MM-dd} 去重 + 数据库唯一索引兜底）。
     * <p>整轮扫描接 {@code executeOnce} 幂等：同一操作人同一项目同一天重复点击直接回放首次结果。
     * <p><b>A.6 资源守卫</b>：菜单权限之外额外要求项目成员身份，非成员不得向别人项目的责任人发催办。
     */
    @PostMapping("/{id}/urge")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_PROJECT, action = "edit")
    public Result<RdmTodoNotifyService.TodoNotifyResult> urgeProject(@PathVariable Long id) {
        accessGuard.requireProjectMember(id, currentUserId());
        RdmTodoNotifyService.TodoNotifyResult result = todoNotifyService.urgeProjectManually(id, currentUserId());
        log.info("RDM 项目待办已催办: projectId={}, 新入队={}, 去重跳过={}, 非工作日={}, operator={}",
                id, result.getNotified(), result.getDeduped(), result.getNonWorkingDay(),
                operatorResolver.currentOperatorName());
        return Result.success("已按工作日口徑催辦", result);
    }

    /** 当前登录人 ID（未登录返回 null，由服务层与 @RequirePermission 双重兜底） */
    private Long currentUserId() {
        SysUser user = operatorResolver.currentUser();
        return user == null ? null : user.getId();
    }

    /** 路径变量哨兵归一：{@code 0} 表示「不限项目」（跨项目工作台视角） */
    private static Long normalizeProjectId(Long id) {
        return id == null || id <= 0L ? null : id;
    }
}
