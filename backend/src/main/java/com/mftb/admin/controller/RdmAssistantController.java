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
    /** 数据范围判定：查重对任何人可用，但明细只能给看得到别人需求的人 */
    private final com.mftb.admin.service.RdmAccessGuard accessGuard;

    /**
     * 相似需求查重：提单前拦重复，任何人可查。
     * <p>“任何人可查”不等于“任何人可看明细”：普通员工的需求清单只能看自己的，
     * 如果查重能把别人在途需求的标题/编号/部门列出来，等于开了绕过列表范围的全库入口；
     * 所以无处理权限的人只拿到相似度与在途标记，明细列隐去。
     */
    @GetMapping("/similar")
    @Operation(summary = "相似需求查重（确定性算法，非大模型）")
    public Result<RdmAssistantVO.SimilarResult> similar(@RequestParam(required = false) String title,
                                                        @RequestParam(required = false) String expectText,
                                                        @RequestParam(required = false) Long excludeId) {
        return Result.success(similarService.findSimilar(title, expectText, excludeId,
                operatorResolver.currentOperatorName(), similarFullAccess()));
    }

    /** 管理岗或可分派的需求处理岗才能看到别人需求的明细 */
    private boolean similarFullAccess() {
        var current = operatorResolver.currentUser();
        return accessGuard.canSeeAll(current) || accessGuard.canDispatch(current);
    }

    /** PRD 草稿生成（产品经理视角，结果需人工确认后才保存） */
    @PostMapping("/prd-draft")
    @Operation(summary = "生成 PRD 草稿")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, action = "edit", anyOf = {"rdm-delivery-board", "rdm-delivery-iteration"})
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

    /**
     * 风险摘要（风险中心页与看板共用）。
     * <p>@param minStayDays 只看「当前状态停留 ≥ N 天」的风险；0 = 全部。旧参数名叫 days、默认 14，
     * 但 SQL 从没用过它，“近 14 天”是假的窗口，现在按真实语义改名。
     */
    @PostMapping("/risk-summary")
    @Operation(summary = "逾期与阻塞风险摘要")
    @RequirePermission(menu = RdmConstants.MENU_DASHBOARD_BOARD, anyOf = {"rdm-dashboard-quality", "rdm-dashboard-report", "rdm-intake", "rdm-dashboard-risk"})
    public Result<RdmAssistantVO.RiskSummary> riskSummary(
            @RequestParam(required = false, defaultValue = "0") Integer minStayDays) {
        String blocked = killSwitchNotice();
        int stay = minStayDays == null ? 0 : minStayDays;
        if (blocked != null) {
            // 熔断不吞掉风险本身：仍返回结构化要点，只是没有 AI 叙述
            RdmAssistantVO.RiskSummary summary = assistantService.riskSummary(stay, null);
            summary.setNotice(blocked);
            return Result.success(summary);
        }
        return Result.success(assistantService.riskSummary(stay, operatorResolver.currentOperatorName()));
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
