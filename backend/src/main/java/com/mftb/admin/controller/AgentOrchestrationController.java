package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.service.agent.AgentOrchestrationService;
import com.mftb.admin.service.agent.AgentOrchestrationService.OrchestrateRequest;
import com.mftb.admin.service.agent.AgentOrchestrationService.OrchestrateResult;
import com.mftb.admin.service.agent.AiKillSwitchService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * V0 §B.1：后端多轮 tool 编排入口。
 * <p>熔断或额度不足时以文本形式返回（不抛），保持聊天 UX；外部工具命中时
 * 返回 pendingExternalCalls 让前端确认后再走 /api/mcp/exec。
 */
@Slf4j
@RestController
@RequestMapping("/api/agent")
@RequiredArgsConstructor
public class AgentOrchestrationController {

    private final AgentOrchestrationService orchestrationService;
    private final AiKillSwitchService killSwitchService;
    private final OperatorResolver operatorResolver;

    @PostMapping("/orchestrate")
    @Operation(summary = "多轮工具编排（后端 tool 循环）")
    public Result<OrchestrateResult> orchestrate(@RequestBody OrchestrateRequest req) {
        String caller = operatorResolver.currentOperatorName();
        OrchestrateResult out = new OrchestrateResult();
        if (caller == null) {
            out.setText("登錄狀態無效或已過期，請重新登錄後使用 AI 助手");
            return Result.success(out);
        }
        if (killSwitchService.isEngaged()) {
            AiKillSwitchService.Status st = killSwitchService.current();
            out.setText("AI 服務已臨時停用（緊急熔斷中）。操作人：" + st.operator() + "；原因：" + st.reason());
            return Result.success(out);
        }
        return Result.success(orchestrationService.orchestrate(req, caller));
    }
}
