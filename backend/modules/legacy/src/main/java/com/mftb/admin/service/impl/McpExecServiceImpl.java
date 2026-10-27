package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.AiToolExecLog;
import com.mftb.admin.entity.McpTool;
import com.mftb.admin.mapper.McpToolMapper;
import com.mftb.admin.service.AiToolPolicyService;
import com.mftb.admin.service.McpExecService;
import com.mftb.admin.service.McpExternalHandler;
import com.mftb.admin.service.AiConversationEventService;
import com.mftb.admin.service.agent.AiKillSwitchService;
import com.mftb.admin.util.OperatorResolver;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * MCP 外部工具统一执行网关。V0 §B.2 新增：
 * ai_tool_policy 前置拦截（默认拒绝/启停/审批凭证）、执行审计日志、参数摘要（不落敏感原文）。
 * 兼容旧接口 execute(toolKey, args) 走 approvalToken=null；控制器层根据请求携带 token。
 */
@Slf4j
@Service
public class McpExecServiceImpl implements McpExecService {

    private final McpToolMapper mcpToolMapper;
    private final OperatorResolver operatorResolver;
    private final AiToolPolicyService policyService;
    /** V0 §B.6：会话执行事件（仅在传入 conversationPk 时写入） */
    private final AiConversationEventService eventService;
    /** V0 §八 V0-7：熎断优先，命中时一律拒绝工具执行 */
    private final AiKillSwitchService killSwitchService;
    /** WP07：外部工具执行完必须写回执，否则提案会永久停在 executing。 */
    private final com.mftb.admin.service.agent.platform.AiActionProposalService proposals;
    private final Map<String, McpExternalHandler> handlers;

    public McpExecServiceImpl(McpToolMapper mcpToolMapper, OperatorResolver operatorResolver,
                              AiToolPolicyService policyService,
                              AiConversationEventService eventService,
                              AiKillSwitchService killSwitchService,
                              com.mftb.admin.service.agent.platform.AiActionProposalService proposals,
                              List<McpExternalHandler> handlerList) {
        this.mcpToolMapper = mcpToolMapper;
        this.operatorResolver = operatorResolver;
        this.policyService = policyService;
        this.eventService = eventService;
        this.killSwitchService = killSwitchService;
        this.proposals = proposals;
        this.handlers = handlerList.stream()
                .collect(Collectors.toMap(McpExternalHandler::toolKey, Function.identity()));
    }

    @Override
    public String execute(String toolKey, Map<String, Object> args) {
        return execute(toolKey, args, null, null, null);
    }

    public String execute(String toolKey, Map<String, Object> args,
                          String approvalToken, String conversationId) {
        return execute(toolKey, args, approvalToken, conversationId, null);
    }

    public String execute(String toolKey, Map<String, Object> args,
                          String approvalToken, String conversationId, Long conversationPk) {
        String caller = operatorResolver.currentOperatorAccount();
        String ownedNumber = eventService.requireOwned(conversationPk, caller);
        if (conversationId != null && !conversationId.equals(ownedNumber)) {
            throw new com.mftb.admin.common.BusinessException(400, "會話編號不一致");
        }
        conversationId = ownedNumber;
        // V0 §八 V0-7：熎断优先于工具策略，命中时直接拒绝并写审计
        if (killSwitchService.isEngaged()) {
            recordRejectUnderKillSwitch(toolKey, caller, conversationId, conversationPk);
            throw new IllegalStateException("AI 服务已临时停用（紧急熎断中），无法执行外部工具：" + toolKey);
        }
        String digest = digestArgs(args);
        // V0 §B.2：先执行 ai_tool_policy 前置拦截（默认拒绝/启停/审批凭证）
        try {
            policyService.enforce(toolKey, approvalToken, caller, digest, args);
            appendEvent(conversationPk, "POLICY_DECISION", caller,
                    Map.of("toolKey", toolKey, "decision", "allow"));
        } catch (RuntimeException e) {
            appendEvent(conversationPk, "POLICY_DECISION", caller,
                    Map.of("toolKey", toolKey, "decision", "reject", "error", String.valueOf(e.getMessage())));
            throw e;
        }
        appendEvent(conversationPk, "TOOL_CALL", caller,
                Map.of("toolKey", toolKey, "argsDigest", digest == null ? "" : digest));

        McpTool tool = mcpToolMapper.selectOne(new LambdaQueryWrapper<McpTool>()
                .eq(McpTool::getToolKey, toolKey)
                .last("LIMIT 1"));
        if (tool == null || tool.getInstalled() == null || tool.getInstalled() != 1) {
            recordAllow(toolKey, caller, conversationId, digest, 0, 0L, "not_installed");
            throw new IllegalArgumentException("外部服務未安裝或不存在: " + toolKey);
        }
        if (!"external".equals(tool.getSource())) {
            recordAllow(toolKey, caller, conversationId, digest, 0, 0L, "not_external");
            throw new IllegalArgumentException("僅外部服務經執行網關調用: " + toolKey);
        }
        McpExternalHandler handler = handlers.get(toolKey);
        if (handler == null) {
            recordAllow(toolKey, caller, conversationId, digest, 0, 0L, "handler_missing");
            throw new IllegalStateException("該外部服務執行器尚未接入: " + tool.getName());
        }
        long start = System.currentTimeMillis();
        String result;
        int success = 1;
        String err = null;
        try {
            result = handler.execute(args == null ? Map.of() : args,
                    new com.mftb.admin.service.McpExternalHandler.ToolCallContext(caller, conversationPk, conversationId));
        } catch (RuntimeException e) {
            success = 0;
            err = e.getClass().getSimpleName() + ": " + e.getMessage();
            recordProposalReceipt(approvalToken, "unknown", err, digest);
            appendEvent(conversationPk, "TOOL_RESULT", caller,
                    Map.of("toolKey", toolKey, "success", 0, "error", String.valueOf(err)));
            throw e;
        } finally {
            long cost = System.currentTimeMillis() - start;
            recordAllow(toolKey, caller, conversationId, digest, success, cost, err);
        }
        appendEvent(conversationPk, "TOOL_RESULT", caller,
                Map.of("toolKey", toolKey, "success", 1));
        recordProposalReceipt(approvalToken, "accepted", null, digest);
        log.info("[MCP Exec] tool={} caller={} success={}", toolKey, caller, success);
        return result;
    }

    /** 熎断命中时写一条拒绝日志，不写 ai_conversation_event（避免无会话 pk 时 NPE）。 */
    private void recordRejectUnderKillSwitch(String toolKey, String caller, String conversationId, Long conversationPk) {
        AiToolExecLog entry = new AiToolExecLog();
        entry.setToolKey(toolKey);
        entry.setCaller(caller);
        entry.setConversationId(conversationId);
        entry.setDecision("reject");
        entry.setRejectReason("kill_switch_engaged");
        entry.setSuccess(0);
        policyService.logExecution(entry);
        appendEvent(conversationPk, "POLICY_DECISION", caller,
                java.util.Map.of("toolKey", toolKey, "decision", "reject", "reason", "kill_switch_engaged"));
    }

    /** 写入会话事件；conversationPk 为空时静默跳过。失败不阻断主链路。 */
    private void appendEvent(Long conversationPk, String type, String actor, Map<String, Object> payload) {
        if (conversationPk == null) return;
        eventService.append(conversationPk, null, type, actor, payload);
    }

    private void recordAllow(String toolKey, String caller, String conversationId,
                             String digest, int success, long cost, String rejectReason) {
        AiToolExecLog entry = new AiToolExecLog();
        entry.setToolKey(toolKey);
        entry.setCaller(caller);
        entry.setConversationId(conversationId);
        entry.setArgsDigest(digest);
        entry.setDecision("allow");
        entry.setRejectReason(rejectReason);
        entry.setElapsedMs(cost);
        entry.setSuccess(success);
        policyService.logExecution(entry);
    }

    /** 仅当 approvalToken 是动作提案号时写回执；普通凭证不产生副作用。 */
    private void recordProposalReceipt(String approvalToken, String status, String detail, String digest) {
        if (approvalToken == null || !approvalToken.startsWith("AP")) return;
        try {
            proposals.recordReceiptByNo(approvalToken, status, null, detail, digest);
        } catch (RuntimeException e) {
            log.warn("[MCP Exec] 提案回执写入失败 type={}", e.getClass().getSimpleName());
        }
    }

    /** 参数摘要：SHA-256 前 16 位；不落敏感原文，供回溯相同参数的多次调用。 */
    private String digestArgs(Map<String, Object> args) {
        if (args == null || args.isEmpty()) return null;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(args.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(16);
            for (int i = 0; i < 8; i++) sb.append(String.format("%02x", hash[i]));
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
