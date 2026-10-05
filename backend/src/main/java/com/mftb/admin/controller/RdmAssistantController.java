package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmAssistantVO;
import com.mftb.admin.service.RdmAssistantService;
import com.mftb.admin.service.RdmSimilarService;
import com.mftb.admin.service.agent.AiKillSwitchService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 產研協同（RDM）AI 辅助接口（M4+）。
 *
 * <p>三个能力按可信度分层，刻意不是一套统一入口：
 * <ul>
 *   <li>相似查重：确定性算法，任何情况下可用（熔断也不影响提单拦重）；</li>
 *   <li>PRD 草稿：受熔断与配额约束，且只返回草稿、不落库；</li>
 *   <li>风险摘要：数字来自 SQL，AI 只写叙述；熔断时返回结构化要点 + 明确提示。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/rdm/assistant")
@RequiredArgsConstructor
public class RdmAssistantController {

    private final RdmAssistantService assistantService;
    private final RdmSimilarService similarService;
    private final AiKillSwitchService killSwitchService;
    private final OperatorResolver operatorResolver;

    /**
     * 相似需求查重：提单前拦重复，任何人可查（只读，且是脱敏前的最小字段集）。
     * <p>不看菜单权限：普通业务员工在提交页就要能用，否则这个功能等于没有。
     */
    @GetMapping("/similar")
    @Operation(summary = "相似需求查重（确定性算法，非大模型）")
    public Result<RdmAssistantVO.SimilarResult> similar(@RequestParam(required = false) String title,
                                                        @RequestParam(required = false) String expectText,
                                                        @RequestParam(required = false) Long excludeId) {
        return Result.success(similarService.findSimilar(title, expectText, excludeId,
                operatorResolver.currentOperatorName()));
    }

    /** PRD 草稿生成（产品经理视角，结果需人工确认后才保存） */
    @PostMapping("/prd-draft")
    @Operation(summary = "生成 PRD 草稿")
    @RequirePermission(menu = RdmConstants.MENU_PRODUCT, action = "edit", anyOf = {
            "rdm-delivery-board", "rdm-delivery-iteration"})
    public Result<RdmAssistantVO.PrdDraft> prdDraft(@RequestParam Long reqId) {
        String blocked = killSwitchNotice();
        if (blocked != null) {
            RdmAssistantVO.PrdDraft draft = new RdmAssistantVO.PrdDraft();
            draft.setReqId(reqId);
            draft.setAiGenerated(false);
            draft.setNotice(blocked);
            return Result.success(draft);
        }
        return Result.success(assistantService.prdDraft(reqId, operatorResolver.currentOperatorName()));
    }

    /** 逾期风险摘要（看板视角） */
    @PostMapping("/risk-summary")
    @Operation(summary = "逾期与阻塞风险摘要")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_BOARD, anyOf = {
            "rdm-dashboard-quality", "rdm-dashboard-report", "rdm-intake", "rdm-product"})
    public Result<RdmAssistantVO.RiskSummary> riskSummary(@RequestParam(required = false, defaultValue = "14") Integer days) {
        String blocked = killSwitchNotice();
        int window = days == null ? 14 : days;
        if (blocked != null) {
            // 熔断不吞掉风险本身：仍返回结构化要点，只是没有 AI 叙述
            RdmAssistantVO.RiskSummary summary = assistantService.riskSummary(window, null);
            summary.setNotice(blocked);
            return Result.success(summary);
        }
        return Result.success(assistantService.riskSummary(window, operatorResolver.currentOperatorName()));
    }

    /** 熔断时给前端的统一提示（带操作人与原因，便于管理员沟通而非让用户猜） */
    private String killSwitchNotice() {
        if (!killSwitchService.isEngaged()) {
            return null;
        }
        AiKillSwitchService.Status status = killSwitchService.current();
        String reason = StringUtils.hasText(status.reason()) ? status.reason() : "未填写";
        return "AI 功能当前已緊急熔斷（操作人：" + status.operator() + "，原因：" + reason + "）";
    }
}
