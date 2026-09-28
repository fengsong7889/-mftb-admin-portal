package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.dto.HrPerfAssessmentVO;
import com.mftb.admin.dto.HrPerfCycleSaveDTO;
import com.mftb.admin.dto.HrPerfCycleVO;
import com.mftb.admin.dto.HrPerfPlanLaunchDTO;
import com.mftb.admin.dto.HrPerfPlanVO;
import com.mftb.admin.dto.HrPerfScoreSubmitDTO;
import com.mftb.admin.dto.HrPerfTemplateSaveDTO;
import com.mftb.admin.dto.HrPerfTemplateVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.HrPerfService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 績效考核管理接口（周期/模板/计划/评分工作台/校准确认）。
 * <p>
 * 员工自助入口在 {@link HrPerfSelfController}，两者权限与可见字段不同。
 */
@RestController
@RequestMapping("/api/hr/perf")
@RequiredArgsConstructor
public class HrPerfController {

    private final HrPerfService hrPerfService;

    // ==================== 周期 ====================

    @GetMapping("/cycles")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN)
    public Result<PageResult<HrPerfCycleVO>> cycles(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrPerfService.pageCycles(page, size, status, keyword));
    }

    @PostMapping("/cycles")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN, action = "create")
    public Result<HrPerfCycleVO> createCycle(@Valid @RequestBody HrPerfCycleSaveDTO dto) {
        return Result.success("週期已保存", hrPerfService.saveCycle(null, dto));
    }

    @PutMapping("/cycles/{id}")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN, action = "edit")
    public Result<HrPerfCycleVO> updateCycle(@PathVariable Long id, @Valid @RequestBody HrPerfCycleSaveDTO dto) {
        return Result.success("週期已保存", hrPerfService.saveCycle(id, dto));
    }

    @PostMapping("/cycles/{id}/status")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN, action = "edit")
    public Result<Void> changeCycleStatus(@PathVariable Long id, @RequestParam String status) {
        hrPerfService.changeCycleStatus(id, status);
        return Result.success("週期狀態已更新", null);
    }

    // ==================== 模板 ====================

    @GetMapping("/templates")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN)
    public Result<PageResult<HrPerfTemplateVO>> templates(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrPerfService.pageTemplates(page, size, keyword));
    }

    @GetMapping("/templates/{id}")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN)
    public Result<HrPerfTemplateVO> template(@PathVariable Long id) {
        return Result.success(hrPerfService.getTemplate(id));
    }

    @PostMapping("/templates")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN, action = "create")
    public Result<HrPerfTemplateVO> createTemplate(@Valid @RequestBody HrPerfTemplateSaveDTO dto) {
        return Result.success("模板已保存", hrPerfService.saveTemplate(null, dto));
    }

    @PutMapping("/templates/{id}")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN, action = "edit")
    public Result<HrPerfTemplateVO> updateTemplate(@PathVariable Long id,
                                                   @Valid @RequestBody HrPerfTemplateSaveDTO dto) {
        return Result.success("模板已保存", hrPerfService.saveTemplate(id, dto));
    }

    // ==================== 计划 ====================

    /** 发起表单的部门/职级选项 */
    @GetMapping("/scope-options")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN)
    public Result<Map<String, Object>> scopeOptions() {
        return Result.success(hrPerfService.scopeOptions());
    }

    /** 评估人改派下拉（仅人事校准入口可用） */
    @GetMapping("/evaluator-options")
    @RequirePermission(menu = HrPerfConstants.MENU_CALIBRATION, anyOf = HrPerfConstants.MENU_ADMIN)
    public Result<List<Map<String, Object>>> evaluatorOptions(@RequestParam(required = false) String keyword) {
        return Result.success(hrPerfService.evaluatorOptions(keyword));
    }

    /** 发起前范围预览：命中人数与待指派评估人清单 */
    @PostMapping("/plans/preview")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN, action = "create")
    public Result<Map<String, Object>> previewPlan(@Valid @RequestBody HrPerfPlanLaunchDTO dto) {
        return Result.success(hrPerfService.previewLaunch(dto));
    }

    @PostMapping("/plans")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN, action = "create")
    public Result<HrPerfPlanVO> launchPlan(@Valid @RequestBody HrPerfPlanLaunchDTO dto) {
        return Result.success("考核計劃已發起", hrPerfService.launchPlan(dto));
    }

    @GetMapping("/plans")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN)
    public Result<PageResult<HrPerfPlanVO>> plans(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) Long cycleId,
            @RequestParam(required = false) String status) {
        return Result.success(hrPerfService.pagePlans(page, size, cycleId, status));
    }

    @GetMapping("/plans/{id}")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN)
    public Result<HrPerfPlanVO> plan(@PathVariable Long id) {
        return Result.success(hrPerfService.getPlan(id));
    }

    /** 计划内考核单清单（台账视图）：周期管理或校准确认菜单均可读，不让只有其一的角色碰壁 */
    @GetMapping("/plans/{id}/assessments")
    @RequirePermission(menu = HrPerfConstants.MENU_ADMIN, anyOf = HrPerfConstants.MENU_CALIBRATION)
    public Result<PageResult<HrPerfAssessmentVO>> planAssessments(
            @PathVariable Long id,
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrPerfService.pagePlanAssessments(id, page, size, status, keyword));
    }

    /** 计划所用模板的等级清单（校准改判下拉只能用模板内等级） */
    @GetMapping("/plans/{id}/grades")
    @RequirePermission(menu = HrPerfConstants.MENU_CALIBRATION, anyOf = HrPerfConstants.MENU_ADMIN)
    public Result<List<Map<String, Object>>> planGrades(@PathVariable Long id) {
        return Result.success(hrPerfService.planGrades(id));
    }

    // ==================== 评分工作台 ====================

    @GetMapping("/reviews")
    @RequirePermission(menu = HrPerfConstants.MENU_REVIEW)
    public Result<PageResult<HrPerfAssessmentVO>> reviews(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrPerfService.pageMyReviews(page, size, status, keyword));
    }

    // ==================== 考核单与评分（管理端与工作台共用） ====================

    @GetMapping("/assessments/{id}")
    @RequirePermission(menu = HrPerfConstants.MENU_REVIEW,
            anyOf = {HrPerfConstants.MENU_ADMIN, HrPerfConstants.MENU_CALIBRATION, HrPerfConstants.MENU_SELF})
    public Result<HrPerfAssessmentVO> assessment(@PathVariable Long id) {
        return Result.success(hrPerfService.getAssessment(id));
    }

    @PostMapping("/assessments/{id}/score")
    @RequirePermission(menu = HrPerfConstants.MENU_REVIEW, action = "edit",
            anyOf = {HrPerfConstants.MENU_SELF, HrPerfConstants.MENU_ADMIN, HrPerfConstants.MENU_CALIBRATION})
    public Result<HrPerfAssessmentVO> submitScore(@PathVariable Long id,
                                                  @Valid @RequestBody HrPerfScoreSubmitDTO dto) {
        return Result.success("評分已保存", hrPerfService.submitScore(id, dto));
    }

    @PostMapping("/assessments/{id}/evaluator")
    @RequirePermission(menu = HrPerfConstants.MENU_CALIBRATION, action = "edit")
    public Result<Void> reassign(@PathVariable Long id, @RequestParam Long evaluatorUserId) {
        hrPerfService.reassign(id, evaluatorUserId);
        return Result.success("評估人已改派", null);
    }

    // ==================== 校准与整批确认 ====================

    @GetMapping("/calibration")
    @RequirePermission(menu = HrPerfConstants.MENU_CALIBRATION)
    public Result<PageResult<HrPerfAssessmentVO>> calibration(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) Long planId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrPerfService.pageCalibration(page, size, planId, status, keyword));
    }

    @PostMapping("/assessments/{id}/calibrate")
    @RequirePermission(menu = HrPerfConstants.MENU_CALIBRATION, action = "edit")
    public Result<HrPerfAssessmentVO> calibrate(@PathVariable Long id,
                                                @RequestParam(required = false) BigDecimal score,
                                                @RequestParam(required = false) String grade,
                                                @RequestParam String reason) {
        return Result.success("校準已登記", hrPerfService.calibrate(id, score, grade, reason));
    }

    @PostMapping("/plans/{id}/submit-confirm")
    @RequirePermission(menu = HrPerfConstants.MENU_CALIBRATION, action = "edit")
    public Result<HrPerfPlanVO> submitConfirm(
            @PathVariable Long id,
            @RequestParam(required = false, defaultValue = "false") Boolean waiveDistribution,
            @RequestParam(required = false) String waiveReason) {
        return Result.success("已提交審批", hrPerfService.submitConfirm(id, waiveDistribution, waiveReason));
    }
}
