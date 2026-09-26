package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.HrLifecycleConstants;
import com.mftb.admin.dto.HrEmployeeBriefVO;
import com.mftb.admin.dto.HrLifecycleRequestSaveDTO;
import com.mftb.admin.dto.HrLifecycleVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.HrLifecycleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * HR 入转调离生命周期单据接口（入职/转正/调动/离职）。
 * <p>
 * 四个菜单共享本组端点：注解层只做 anyOf 粗粒度拦截（持有任一 HR 生命周期菜单即可进入），
 * 类型级细粒度权限（单据 type → 对应菜单 action）由服务层兜底校验。
 */
@RestController
@RequestMapping("/api/hr/lifecycle")
@RequiredArgsConstructor
public class HrLifecycleController {

    private final HrLifecycleService hrLifecycleService;

    /** 分页查询单据 */
    @GetMapping
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"})
    public Result<PageResult<HrLifecycleVO>> list(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrLifecycleService.page(page, size, type, status, keyword));
    }

    /** 各状态单据数量（列表 Tab 徽标） */
    @GetMapping("/stats")
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"})
    public Result<Map<String, Long>> stats(@RequestParam String type) {
        return Result.success(hrLifecycleService.stats(type));
    }

    /** 单据详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"})
    public Result<HrLifecycleVO> detail(@PathVariable Long id) {
        return Result.success(hrLifecycleService.detail(id));
    }

    /** 发起单据时选择员工后的概要回填（转正/调动/离职共用） */
    @GetMapping("/employee-brief")
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"})
    public Result<HrEmployeeBriefVO> employeeBrief(@RequestParam Long userId) {
        return Result.success(hrLifecycleService.employeeBrief(userId));
    }

    /** 员工搜索下拉（按单据类型菜单授权校验） */
    @GetMapping("/employee-options")
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"})
    public Result<List<HrEmployeeBriefVO>> employeeOptions(
            @RequestParam String type,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrLifecycleService.searchEmployees(type, keyword));
    }

    /** 保存草稿 */
    @PostMapping
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"}, action = "create")
    public Result<HrLifecycleVO> saveDraft(@Valid @RequestBody HrLifecycleRequestSaveDTO dto) {
        return Result.success("草稿已保存", hrLifecycleService.saveDraft(dto));
    }

    /** 编辑草稿/驳回/已撤销单据 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"}, action = "edit")
    public Result<HrLifecycleVO> update(@PathVariable Long id,
                                        @Valid @RequestBody HrLifecycleRequestSaveDTO dto) {
        return Result.success("單據已更新", hrLifecycleService.update(id, dto));
    }

    /** 提交审批（创建关联 OA 流程） */
    @PostMapping("/{id}/submit")
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"}, action = "edit")
    public Result<HrLifecycleVO> submit(@PathVariable Long id) {
        HrLifecycleVO vo = hrLifecycleService.submit(id);
        return Result.success("已提交審批，流程編號：" + vo.getFlowNo(), vo);
    }

    /** 撤销审批（单据回到草稿，联动撤销在途 OA 流程） */
    @PostMapping("/{id}/cancel")
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"}, action = "edit")
    public Result<Void> cancel(@PathVariable Long id) {
        hrLifecycleService.cancel(id);
        return Result.success("已撤銷，單據回到草稿", null);
    }

    /** 删除单据（仅草稿/驳回/已撤销） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "hr-onboarding", anyOf = {"hr-regularization", "hr-transfer", "hr-dimission"}, action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        hrLifecycleService.delete(id);
        return Result.success("單據已刪除", null);
    }
}
