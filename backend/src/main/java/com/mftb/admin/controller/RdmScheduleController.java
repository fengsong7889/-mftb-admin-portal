package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.RdmScheduleDTO;
import com.mftb.admin.dto.RdmScheduleVO;
import com.mftb.admin.service.RdmScheduleService;
import lombok.RequiredArgsConstructor;
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
@RestController
@RequestMapping("/api/rdm/schedule")
@RequiredArgsConstructor
public class RdmScheduleController {

    private final RdmScheduleService scheduleService;

    /** 需求排程（甘特 + 关键路径 + 里程碑） */
    @GetMapping("/requirement/{reqId}/plan")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-intake"})
    public Result<RdmScheduleVO.Plan> plan(@PathVariable Long reqId) {
        return Result.success(scheduleService.plan(reqId));
    }

    /** 依赖列表 */
    @GetMapping("/requirement/{reqId}/dependencies")
    @RequirePermission(menu = "rdm-requirement", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-requirement", "rdm-intake"})
    public Result<List<RdmScheduleVO.Dependency>> dependencies(@PathVariable Long reqId) {
        return Result.success(scheduleService.listDependencies(reqId));
    }

    /** 新增依赖（成环、跨需求、自环会被拒绝） */
    @PostMapping("/dependencies")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<RdmScheduleVO.Dependency> addDependency(@RequestBody RdmScheduleDTO.Dependency dto) {
        return Result.success("依賴已建立", scheduleService.addDependency(dto));
    }

    /** 删除依赖 */
    @DeleteMapping("/dependencies/{id}")
    @RequirePermission(menu = "rdm-requirement", action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration", "rdm-intake"})
    public Result<Void> removeDependency(@PathVariable Long id) {
        scheduleService.removeDependency(id);
        return Result.success("依賴已刪除", null);
    }

    /** 资源负载（默认今天起 4 周，最长 92 天） */
    @GetMapping("/workload")
    @RequirePermission(menu = "rdm-delivery-board", anyOf = {"rdm-requirement", "rdm-delivery-iteration", "rdm-intake"})
    public Result<RdmScheduleVO.Workload> workload(@RequestParam(required = false) String from,
                                                   @RequestParam(required = false) String to,
                                                   @RequestParam(required = false) Long userId) {
        return Result.success(scheduleService.workload(from, to, userId));
    }

    /** 某人的工作日历例外（无全量范围时只能读自己） */
    @GetMapping("/calendar")
    @RequirePermission(menu = "rdm-delivery-board", anyOf = {"rdm-requirement", "rdm-delivery-iteration", "rdm-intake"})
    public Result<List<RdmScheduleVO.CalendarItem>> calendar(@RequestParam(required = false) Long userId) {
        return Result.success(scheduleService.calendar(userId));
    }

    /** 保存工作日历例外（请假/加班/自定义容量） */
    @PostMapping("/calendar")
    @RequirePermission(menu = "rdm-delivery-board", action = "edit", anyOf = {"rdm-requirement", "rdm-delivery-iteration", "rdm-intake"})
    public Result<List<RdmScheduleVO.CalendarItem>> saveCalendar(@RequestBody RdmScheduleDTO.Calendar dto) {
        return Result.success("日曆已更新", scheduleService.saveCalendar(dto));
    }
}
