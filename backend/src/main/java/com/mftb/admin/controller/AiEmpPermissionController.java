package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.AiEmpPermissionDTO;
import com.mftb.admin.service.AiEmpPermissionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 員工AI權額管理控制器
 *
 * 管理員視角：查看任意員工的模型授權與額度配置，
 * 支持編輯能力開關、調整額度值、查詢調整日誌。
 */
@RestController
@RequestMapping("/api/ai/emp-permission")
@RequiredArgsConstructor
@Tag(name = "AI 智能中心 - 員工AI權額管理", description = "管理員視角聚合四維度模型授權與額度配置")
public class AiEmpPermissionController {

    private static final String MENU = "ai-emp-permission";

    private final AiEmpPermissionService empPermissionService;

    @GetMapping("/list")
    @Operation(summary = "列表：查詢全部啟用員工的權額概要")
    @RequirePermission(menu = MENU)
    public Result<List<AiEmpPermissionDTO.SummaryVO>> listSummaries(
            @RequestParam(required = false) String queryName,
            @RequestParam(required = false) String queryDept,
            @RequestParam(required = false) String queryUpdatedBy,
            @RequestParam(required = false) String queryUpdateTimeStart,
            @RequestParam(required = false) String queryUpdateTimeEnd) {
        return Result.success(empPermissionService.listSummaries(
                queryName, queryDept, queryUpdatedBy, queryUpdateTimeStart, queryUpdateTimeEnd));
    }

    @GetMapping("/{empId}")
    @Operation(summary = "詳情：某員工的模型權限明細 + 額度明細")
    @RequirePermission(menu = MENU)
    public Result<AiEmpPermissionDTO.DetailVO> getDetail(@PathVariable Long empId) {
        AiEmpPermissionDTO.DetailVO detail = empPermissionService.getDetail(empId);
        if (detail == null) {
            return Result.error("員工不存在");
        }
        return Result.success(detail);
    }

    @PutMapping("/{empId}")
    @Operation(summary = "保存編輯：能力開關變更 + 額度值調整")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Boolean> save(@PathVariable Long empId, @RequestBody AiEmpPermissionDTO.SaveReq req) {
        empPermissionService.save(empId, req);
        return Result.success(true);
    }

    @GetMapping("/{empId}/adjust-log")
    @Operation(summary = "查詢調整日誌（按時間倒序）")
    @RequirePermission(menu = MENU)
    public Result<List<AiEmpPermissionDTO.AdjustLogVO>> getAdjustLogs(@PathVariable Long empId) {
        return Result.success(empPermissionService.getAdjustLogs(empId));
    }
}
