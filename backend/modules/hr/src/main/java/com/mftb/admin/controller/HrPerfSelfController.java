package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.HrPerfConstants;
import com.mftb.admin.dto.HrPerfAppealSubmitDTO;
import com.mftb.admin.dto.HrPerfAppealVO;
import com.mftb.admin.dto.HrPerfAssessmentVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.HrPerfReportService;
import com.mftb.admin.service.HrPerfService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 員工自助「我的績效」接口。
 * <p>
 * 一律以登录人为数据范围，且未确认单据的评分/等级字段由服务层物理裁剪，
 * 因此本组端点不接收任何员工标识参数。
 */
@RestController
@RequestMapping("/api/hr/perf/my")
@RequiredArgsConstructor
public class HrPerfSelfController {

    private final HrPerfService hrPerfService;
    private final HrPerfReportService hrPerfReportService;

    /** 我的考核单列表（含进行中任务与历史已确认结果） */
    @GetMapping
    @RequirePermission(menu = HrPerfConstants.MENU_SELF)
    public Result<PageResult<HrPerfAssessmentVO>> myAssessments(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String status) {
        return Result.success(hrPerfService.pageMyAssessments(page, size, status));
    }

    /** 我的考核单详情（未确认时只回本人可见范围） */
    @GetMapping("/{id}")
    @RequirePermission(menu = HrPerfConstants.MENU_SELF)
    public Result<HrPerfAssessmentVO> myAssessment(@PathVariable Long id) {
        return Result.success(hrPerfService.getMyAssessment(id));
    }

    /**
     * 对本人已确认结果提申诉。
     * <p>
     * 路径用 {@code /{id}/appeal} 而非 {@code /appeals} 前缀，避免与上面的
     * {@code GET /{id}} 详模式抢同一层级；数据范围在服务端固定为登录人。
     */
    @PostMapping("/{id}/appeal")
    @RequirePermission(menu = HrPerfConstants.MENU_SELF, action = "create")
    public Result<HrPerfAppealVO> submitAppeal(@PathVariable Long id, @Valid @RequestBody HrPerfAppealSubmitDTO dto) {
        return Result.success("申訴已提交", hrPerfReportService.submitAppeal(id, dto));
    }

    /** 我的申诉列表（只能看到自己提的） */
    @GetMapping("/appeals/list")
    @RequirePermission(menu = HrPerfConstants.MENU_SELF)
    public Result<PageResult<HrPerfAppealVO>> myAppeals(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) String status) {
        return Result.success(hrPerfReportService.pageMyAppeals(page, size, status));
    }
}
