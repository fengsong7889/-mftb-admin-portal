package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmTaskTypeConfig;
import com.mftb.admin.service.RdmTaskTypeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * RDM 任务类型字典接口。
 * <p>
 * {@code GET /rdm/task-types} 为表单/甘特图共享的只读引用数据（启用项），
 * 任务表单（研发工作台）、甘特图（需求跟进清单）、需求详情等页都会消费，
 * 故通过 anyOf 允许任一任务承载菜单访问（默认拒绝）；
 * 管理端点（列表含停用/新增/更新/启停）锚定独立菜单 {@code rdm-task-type-config}（view/edit），
 * 写动作统一挂 edit，与字典管理页授权口径一致。
 * <p>
 * 不提供 DELETE：code 永续（仅停用），保护 {@code rdm_work_task.task_type} 历史引用。
 */
@RestController
@RequestMapping("/api/rdm/task-types")
@RequiredArgsConstructor
@Tag(name = "產研交付 - 任务类型字典", description = "RDM 任务类型可配置字典（下拉/图例/聚合桶同源）")
public class RdmTaskTypeController {

    private final RdmTaskTypeService taskTypeService;

    /** 启用项下拉（表单/甘特图/图例共享只读）——跨菜单共享，任一任务承载菜单即可读 */
    @GetMapping
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_BOARD,
            anyOf = {RdmConstants.MENU_DELIVERY_ITERATION, RdmConstants.MENU_REQUIREMENT,
                    RdmConstants.MENU_INTAKE, RdmConstants.MENU_WORKBENCH,
                    RdmConstants.MENU_ACCEPTANCE, RdmConstants.MENU_DASHBOARD_BOARD})
    @Operation(summary = "任务类型启用下拉")
    public Result<List<RdmTaskTypeConfig>> options() {
        return Result.success(taskTypeService.listEnabled());
    }

    /** 全量含停用（管理页/回溯） */
    @GetMapping("/all")
    @RequirePermission(menu = RdmConstants.MENU_TASK_TYPE_CONFIG)
    @Operation(summary = "任务类型全量列表（含停用）")
    public Result<List<RdmTaskTypeConfig>> listAll() {
        return Result.success(taskTypeService.listAll());
    }

    /** 新增任务类型（code 唯一且永续） */
    @PostMapping
    @RequirePermission(menu = RdmConstants.MENU_TASK_TYPE_CONFIG, action = "edit")
    @Operation(summary = "新增任务类型")
    public Result<Long> create(@RequestBody RdmTaskTypeConfig cfg) {
        return Result.success("任務類型已新增", taskTypeService.create(cfg));
    }

    /** 更新任务类型（code 为身份键不可改） */
    @PutMapping("/{id}")
    @RequirePermission(menu = RdmConstants.MENU_TASK_TYPE_CONFIG, action = "edit")
    @Operation(summary = "更新任务类型")
    public Result<Void> update(@PathVariable Long id, @RequestBody RdmTaskTypeConfig cfg) {
        taskTypeService.update(id, cfg);
        return Result.success();
    }

    /** 启用/停用（停用仅影响下拉展示，存量任务不受影响） */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = RdmConstants.MENU_TASK_TYPE_CONFIG, action = "edit")
    @Operation(summary = "启用/停用任务类型")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer enabled) {
        taskTypeService.updateStatus(id, enabled);
        return Result.success();
    }
}
