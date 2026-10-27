package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.CrossDependencyRequest;
import com.mftb.admin.dto.RdmScheduleDTO;
import com.mftb.admin.dto.RdmScheduleVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.RdmScheduleService;
import com.mftb.admin.service.impl.RdmScheduleServiceImpl;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 排程控制器（阶段 5：依赖、甘特关键路径、工作日历与资源负载）。
 * <p>读接口沿用交付类菜单的 anyOf 授权，数据范围在服务端按需求收敛；
 * 负载读接口对无全量范围的人只返回本人，避免把负载页变成互相打探绩效的地方。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/schedule")
@RequiredArgsConstructor
public class RdmScheduleController {

    private final RdmScheduleService scheduleService;
    /**
     * 跳交付项依赖与阻塞任务查询只在具体实现类上（非接口能力，属于第二批新增），
     * 与 {@code RdmSummaryService} 注入具体实现类的做法一致；Spring 会将同一 Bean 注入两个字段。
     */
    private final RdmScheduleServiceImpl scheduleServiceImpl;
    private final OperatorResolver operatorResolver;

    /** 需求排程（甘特 + 关键路径 + 里程碑） */
    @GetMapping("/requirement/{reqId}/plan")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<RdmScheduleVO.Plan> plan(@PathVariable Long reqId) {
        return Result.success(scheduleService.plan(reqId));
    }

    /** 需求甘特图（三视角 + 筛选 + 按需求分页；全局视角服务端按 canSeeAll 裁决） */
    @GetMapping("/gantt")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<RdmScheduleVO.GanttPage> gantt(RdmScheduleDTO.GanttQuery query) {
        return Result.success(scheduleService.gantt(query));
    }

    /**
     * 甘特图调期：本人任务计划起止批量更新（乐观锁 + 审计 + 幂等，整批原子）。
     * <p>菜单锚点与「上报进度」同源（rdm-delivery-board:edit）：任务负责人本就需要能写自己的排期；
     * 能否改某条仍由服务层按「负责人本人/管理员 + 任务与需求状态」重裁。
     */
    @PostMapping("/task-plans")
    @RequirePermission(menu = "rdm-delivery-board", action = "edit", anyOf = {"rdm-requirement", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmScheduleVO.TaskPlanResult> updateTaskPlans(@RequestBody RdmScheduleDTO.TaskPlanBatch batch) {
        return Result.success("排期已保存", scheduleService.updateTaskPlans(batch));
    }

    /** 依赖列表 */
    @GetMapping("/requirement/{reqId}/dependencies")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmScheduleVO.Dependency>> dependencies(@PathVariable Long reqId) {
        return Result.success(scheduleService.listDependencies(reqId));
    }

    /** 新增依赖（成环、跨需求、自环会被拒绝） */
    @PostMapping("/dependencies")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmScheduleVO.Dependency> addDependency(@RequestBody RdmScheduleDTO.Dependency dto) {
        return Result.success("依賴已建立", scheduleService.addDependency(dto));
    }

    /** 删除依赖 */
    @DeleteMapping("/dependencies/{id}")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<Void> removeDependency(@PathVariable Long id) {
        scheduleService.removeDependency(id);
        return Result.success("依賴已刪除", null);
    }

    /**
     * 新增跨交付项任务依赖（后续交付项在某节点被前置交付项阻断）。
     * <p>与需求内依赖区分：跨交付项成环在服务端以交付项为节点做 DAG 检测后拒绝；
     * 同一交付项内的两个任务不是跨交付项依赖，服务端会回落到需求内依赖。
     */
    @PostMapping("/cross-delivery-dependency")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    @Operation(summary = "添加跨交付項任務依賴")
    public Result<RdmScheduleVO.Dependency> addCrossDeliveryDependency(@RequestBody CrossDependencyRequest request) {
        if (request == null || request.getPredTaskId() == null || request.getSuccTaskId() == null) {
            throw new BusinessException("前置任務與後續任務不能為空");
        }
        RdmScheduleVO.Dependency dependency = scheduleServiceImpl.addCrossDeliveryDependency(
                request.getPredTaskId(), request.getSuccTaskId(), request.getDepType(),
                request.getBlockPoint(), currentUserId());
        log.info("RDM 跨交付項依賴已添加: predTaskId={}, succTaskId={}, blockPoint={}, operator={}",
                request.getPredTaskId(), request.getSuccTaskId(), request.getBlockPoint(),
                operatorResolver.currentOperatorName());
        return Result.success("跨交付項依賴已添加", dependency);
    }

    /** 获取交付项阻塞任务（因跨交付项依赖未满足而被阻断的任务） */
    @GetMapping("/blocked-tasks/{deliveryItemId}")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    @Operation(summary = "獲取交付項阻塞任務")
    public Result<List<RdmScheduleServiceImpl.BlockedTaskInfo>> getBlockedTasks(@PathVariable Long deliveryItemId) {
        return Result.success(scheduleServiceImpl.getBlockedTasks(deliveryItemId));
    }

    /** 资源负载（默认今天起 4 周，最长 92 天） */
    @GetMapping("/workload")
    @RequirePermission(menu = "rdm-delivery-board", anyOf = {"rdm-requirement", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<RdmScheduleVO.Workload> workload(@RequestParam(required = false) String from,
                                                   @RequestParam(required = false) String to,
                                                   @RequestParam(required = false) Long userId) {
        return Result.success(scheduleService.workload(from, to, userId));
    }

    /** 某人的工作日历例外（无全量范围时只能读自己） */
    @GetMapping("/calendar")
    @RequirePermission(menu = "rdm-delivery-board", anyOf = {"rdm-requirement", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:view_all"})
    public Result<List<RdmScheduleVO.CalendarItem>> calendar(@RequestParam(required = false) Long userId) {
        return Result.success(scheduleService.calendar(userId));
    }

    /** 保存工作日历例外（请假/加班/自定义容量） */
    @PostMapping("/calendar")
    @RequirePermission(menu = "rdm-delivery-board", action = "edit", anyOf = {"rdm-requirement", "rdm-delivery-iteration", "rdm-intake"},
                anyPermissions = {"rdm-requirement:dispatch"})
    public Result<List<RdmScheduleVO.CalendarItem>> saveCalendar(@RequestBody RdmScheduleDTO.Calendar dto) {
        return Result.success("日曆已更新", scheduleService.saveCalendar(dto));
    }

    /** 当前登录人 ID（未登录返回 null，由服务层与 @RequirePermission 双重兜底） */
    private Long currentUserId() {
        SysUser user = operatorResolver.currentUser();
        return user == null ? null : user.getId();
    }
}
