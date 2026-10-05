package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmScoreDTO;
import com.mftb.admin.dto.RdmScoreVO;
import com.mftb.admin.service.RdmScoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * 產研協同（RDM）产出积分接口（M4）。
 *
 * <p>权限口径：积分会被引用进绩效，属于强敏感数据，因此**不给"泛看板权"就能看**：
 * <ul>
 *   <li>看板/趋势读接口按对应子菜单鉴权，且 anyOf 只放同为管理视角的菜单；</li>
 *   <li>规则保存、重算、推送绩效是三个"会改变别人分数"的动作，单独要求 {@code edit}，
 *       且推送动作放在质量口径菜单之外（HR/PMO 才该有）。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/rdm/score")
@RequiredArgsConstructor
public class RdmScoreController {

    private final RdmScoreService scoreService;

    /* ==================== 查询 ==================== */

    /** 产出看板（排名 + 部门对比 + 流水） */
    @GetMapping("/board")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, anyOf = {"rdm-dashboard-board", "rdm-dashboard-quality", "rdm-dashboard-report"})
    public Result<RdmScoreVO.Board> board(@RequestParam(required = false) String periodCode,
                                          @RequestParam(required = false) Long deptId,
                                          @RequestParam(required = false) Long userId) {
        return Result.success(scoreService.board(periodCode, deptId, userId));
    }

    /** 规则列表（含已停用版本，供历史流水解释） */
    @GetMapping("/rules")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG_SCORE, anyOf = {"rdm-dashboard-score", "rdm-dashboard-board"})
    public Result<List<RdmScoreVO.Rule>> rules() {
        return Result.success(scoreService.listRules());
    }

    /** 可选绩效周期 */
    @GetMapping("/cycles")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, anyOf = {"rdm-dashboard-board", "rdm-dashboard-quality", "rdm-dashboard-report"})
    public Result<List<java.util.Map<String, Object>>> cycles() {
        return Result.success(scoreService.cycles());
    }

    /* ==================== 写操作 ==================== */

    /** 保存规则（编辑生效规则会自动升版本，旧版本保留） */
    @PostMapping("/rule")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG_SCORE, action = "edit")
    public Result<RdmScoreVO.Rule> saveRule(@RequestBody RdmScoreDTO.Rule form) {
        return Result.success("規則已保存", scoreService.saveRule(form));
    }

    /** 启用/停用某个规则版本 */
    @PostMapping("/rule/{id}/enabled")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG_SCORE, action = "edit")
    public Result<List<RdmScoreVO.Rule>> setEnabled(@PathVariable Long id, @RequestParam boolean enabled) {
        return Result.success(scoreService.setEnabled(id, enabled));
    }

    /** 试算（不落库），规则页「用真实需求试算」 */
    @PostMapping("/preview")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG_SCORE, anyOf = {"rdm-dashboard-score", "rdm-dashboard-board"})
    public Result<RdmScoreVO.Record> preview(@RequestBody RdmScoreDTO.Preview form) {
        return Result.success(scoreService.preview(form.getReqId(), form.getRoleCode(), form.getUserId()));
    }

    /** 按当前生效规则重算当期流水（幂等） */
    @PostMapping("/recalc")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, action = "edit", anyOf = {"rdm-config-score"})
    public Result<Integer> recalc(@RequestParam(required = false) String periodCode) {
        return Result.success("積分已按當前規則重算", scoreService.recalc(periodCode));
    }

    /** 推送建议值到绩效考核单（HR 仍需校准） */
    @PostMapping("/push-to-perf")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_SCORE, action = "edit", anyOf = {"rdm-config-score"})
    public Result<Integer> pushToPerf(@RequestParam String periodCode) {
        return Result.success("建議值已推送，請在績效考核單校準後確認", scoreService.pushToPerf(periodCode));
    }

    /* ==================== 效能量趋势 ==================== */

    /** 日快照趋势（只读取 rdm_metric_snapshot，不实时算） */
    @GetMapping("/metric-trend")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_TREND, anyOf = {"rdm-dashboard-board", "rdm-dashboard-quality", "rdm-dashboard-score", "rdm-dashboard-report"})
    public Result<List<RdmScoreVO.MetricPoint>> metricTrend(
            @RequestParam(required = false) String dim,
            @RequestParam(required = false, defaultValue = "30") Integer days,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long dimId) {
        return Result.success(scoreService.trend(dim, days, startDate, endDate, dimId));
    }
}
