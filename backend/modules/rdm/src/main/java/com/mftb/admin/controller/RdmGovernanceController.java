package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmGovernanceDTO;
import com.mftb.admin.dto.RdmGovernanceVO;
import com.mftb.admin.service.RdmGovernanceService;
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
 * 绩效治理控制器（阶段 6：贡献预算与 HR 建议）。
 * <p>读按看板菜单，写按积分配置菜单：能让分数进考核的人，必须是被单独授权的人，
 * 不沿用「能看看板就能改数据」的口子。
 */
@RestController
@RequestMapping("/api/rdm/governance")
@RequiredArgsConstructor
public class RdmGovernanceController {

    private final RdmGovernanceService governanceService;

    /** 周期预算与占用 */
    @GetMapping("/budgets")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, anyOf = {"rdm-dashboard-board", "rdm-config-score"})
    public Result<List<RdmGovernanceVO.Budget>> budgets(@RequestParam(required = false) String periodCode) {
        return Result.success(governanceService.budgets(periodCode));
    }

    /** 保存预算 */
    @PostMapping("/budget")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG_SCORE, action = "edit", anyOf = {"rdm-dashboard-score"})
    public Result<RdmGovernanceVO.Budget> saveBudget(@RequestBody RdmGovernanceDTO.Budget form) {
        return Result.success("預算已保存", governanceService.saveBudget(form));
    }

    /** 删除预算 */
    @DeleteMapping("/budget/{id}")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG_SCORE, action = "edit", anyOf = {"rdm-dashboard-score"})
    public Result<Void> deleteBudget(@PathVariable Long id) {
        governanceService.deleteBudget(id);
        return Result.success("預算已刪除", null);
    }

    /** 建议清单 */
    @GetMapping("/suggestions")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, anyOf = {"rdm-dashboard-board", "rdm-config-score"})
    public Result<List<RdmGovernanceVO.Suggestion>> suggestions(@RequestParam(required = false) String periodCode,
                                                               @RequestParam(required = false) String status,
                                                               @RequestParam(required = false) Long deptId) {
        return Result.success(governanceService.suggestions(periodCode, status, deptId));
    }

    /** 从积分流水聚合建议 */
    @PostMapping("/suggestions/generate")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, action = "edit", anyOf = {"rdm-config-score"})
    public Result<Integer> generate(@RequestParam(required = false) String periodCode) {
        int count = governanceService.generate(periodCode);
        return Result.success("已聚合 " + count + " 位成員的建議，等待復核", count);
    }

    /** 复核（确认/驳回） */
    @PostMapping("/suggestions/{id}/review")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, action = "edit", anyOf = {"rdm-config-score"})
    public Result<RdmGovernanceVO.Suggestion> review(@PathVariable Long id, @RequestBody RdmGovernanceDTO.Review form) {
        RdmGovernanceVO.Suggestion vo = governanceService.review(id, form);
        return Result.success(Boolean.TRUE.equals(form.getConfirmed()) ? "已確認，可推送" : "已駁回", vo);
    }

    /** 推送已确认的建议到考核单建议通道 */
    @PostMapping("/push")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, action = "edit", anyOf = {"rdm-config-score"})
    public Result<Integer> push(@RequestParam(required = false) String periodCode) {
        int count = governanceService.push(periodCode);
        return Result.success("已推送 " + count + " 位成員的建議值", count);
    }

    /** 撤回已推送的建议 */
    @PostMapping("/suggestions/{id}/withdraw")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, action = "edit", anyOf = {"rdm-config-score"})
    public Result<RdmGovernanceVO.Suggestion> withdraw(@PathVariable Long id, @RequestParam String reason) {
        return Result.success("已撤回，考核單建議值已清空", governanceService.withdraw(id, reason));
    }
}
