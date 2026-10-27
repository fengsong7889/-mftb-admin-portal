package com.mftb.admin.service.agent.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiToolPolicy;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.service.AiToolPolicyService;
import com.mftb.admin.service.agent.AiToolVisibility;
import com.mftb.admin.service.agent.tool.AgentTool;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * WP07 执行端：把「已审批提案」落到内建工具。
 *
 * <p>与外部 MCP 工具的区别：内建工具在编排循环里拿不到可信提案，因此不能由模型自行触发执行；
 * 必须先由动作卡生成提案、完成审批，再调用本服务。执行参数一律取提案冻结的 JSON，
 * 不接受调用方另传参数；提案消费与回执写入都在这里完成。
 *
 * <p>结果未知（例如下游超时但可能已生效）必须记 {@code unknown} 并等待对账，不允许自动重试。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentActionExecutionService {

    private final List<AgentTool> tools;
    private final AiActionProposalService proposals;
    private final AiToolPolicyService policies;
    private final OperatorResolver operatorResolver;
    private final ObjectMapper mapper;

    public Map<String, Object> executeApproved(String proposalNo, String operator) {
        SysUser user = operatorResolver.currentUser();
        if (user == null || !Integer.valueOf(1).equals(user.getStatus())) {
            throw new BusinessException(401, "登入身分不可用");
        }
        Map<String, Object> proposal = proposals.get(proposalNo);
        if (!operator.equals(proposal.get("requester"))) {
            throw new BusinessException(403, "只能執行本人的動作提案");
        }
        String toolKey = String.valueOf(proposal.get("tool_key"));
        AgentTool tool = tools.stream().filter(t -> t.toolKey().equals(toolKey)).findFirst().orElse(null);
        if (tool == null) throw new BusinessException(400, "該工具不是可執行的內建工具");

        // 工具级策略仍在执行前复核：停用、撤权、可见范围变化都会立即阻断。
        AiToolPolicy policy = policies.find(toolKey);
        if (policy == null || !Integer.valueOf(1).equals(policy.getEnabled()) || !AiToolVisibility.visible(policy, user)) {
            throw new BusinessException(403, "工具已停用或當前帳號無權使用：" + toolKey);
        }

        Map<String, Object> frozen = parseFrozen(proposalNo);
        var consumed = proposals.consume(proposalNo, operator, toolKey, proposals.sha256(proposals.canonicalJson(frozen)));
        long started = System.currentTimeMillis();
        try {
            String content = tool.execute(frozen, new AgentTool.ToolCallContext(operator, null));
            boolean ok = content != null && !content.startsWith("{\"error\"");
            proposals.recordReceipt(consumed.proposalId(), ok ? "accepted" : "failed", null,
                    ok ? "executed" : "tool_returned_error", null);
            log.info("[ActionExec] 提案执行完成 no={} tool={} ok={} elapsed={}ms",
                    proposalNo, toolKey, ok, System.currentTimeMillis() - started);
            return result(proposalNo, ok, content);
        } catch (RuntimeException e) {
            // 可能已产生外部副作用：先记 unknown，交由对账，不自动重跑。
            proposals.recordReceipt(consumed.proposalId(), "unknown", null,
                    e.getClass().getSimpleName(), null);
            log.warn("[ActionExec] 提案执行异常，标记待核实 no={} tool={} type={}",
                    proposalNo, toolKey, e.getClass().getSimpleName());
            return result(proposalNo, false, null);
        }
    }

    /** 冻结参数只从数据库取，忽略调用方任何覆盖字段。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseFrozen(String proposalNo) {
        String json = jdbcParams(proposalNo);
        try {
            return mapper.readValue(json, Map.class);
        } catch (Exception e) {
            throw new BusinessException(500, "提案參數已損壞，無法執行");
        }
    }

    private String jdbcParams(String proposalNo) {
        // proposals.get 不返回 params_json；执行时必须重新读取完整行，避免用调用方参数替代冻结值。
        String json = proposals.rawParams(proposalNo);
        if (!StringUtils.hasText(json)) throw new BusinessException(409, "提案參數不存在");
        return json;
    }

    private Map<String, Object> result(String proposalNo, boolean ok, String content) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("proposalNo", proposalNo);
        out.put("success", ok);
        out.put("proposal", proposals.get(proposalNo));
        if (content != null && content.length() <= 4000) out.put("content", content);
        return out;
    }
}
