package com.mftb.admin.service.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.mftb.admin.dto.LlmUsageRecordRequest;
import com.mftb.admin.service.LlmUsageService;
import com.mftb.admin.service.agent.LlmChannelRouter.Channel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * LLM 计量与预算的统一出口：一次上游往返 = 一条 {@code biz_llm_usage} 明细 + 一条
 * {@code ai_budget_ledger}（RESERVED → SETTLED / RELEASED）。
 * <p>为什么需要它：线上问答走的是 {@code POST /api/agent/orchestrate}，而计量/预算代码当初只写在
 * 旧入口 {@code /api/agent/chat/completions} 里。入口换了、账本没跟着换，结果是「我的用量」
 * 「能耗統計」「能耗明細」恒为 0，额度与预算管控失去依据（AI 消耗变成审计盲区）。两条链路必须
 * 共用同一口径，否则以后再换入口又会漏一段。
 * <p><b>username 一律传登录账号</b>（{@code sys_user.username}）：用量明细按账号 join 员工表补姓名，
 * 传显示名会导致「按员工汇总」匹配不上、账本认不出人。
 * <p>所有方法都是「尽力而为」：记账失败只留警告，绝不因为账本问题把已经成功的 AI 回复丢掉
 * （但缺口必须能被日志查出来）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LlmMeteringService {

    /** 无 usage 字段/失败时的预占释放原因前缀，便于账本排查 */
    private static final int NO_USAGE_TOKENS = 0;

    private final LlmUsageService llmUsageService;
    private final BudgetReservationService budgetService;

    /**
     * 发起上游调用前预占。同 requestId 重复调用命中已有行直接复用（幂等）。
     * 预占失败不阻断问答：没有预占行时 settle 自然命中 0 行而被忽略。
     */
    public void reserve(String requestId, String account, Channel channel, int promptEst, int completionEst) {
        if (channel == null) {
            return;
        }
        try {
            budgetService.reserve(requestId, account, channel.getDefaultModelKey(), promptEst, completionEst,
                    channel.getInputPrice(), channel.getOutputPrice(), channel.getCurrency());
        } catch (com.mftb.admin.service.agent.platform.AiBudgetPoolService.BudgetDeniedException e) {
            // 预算池拒绝不能降级为“只记日志”：没有预占就不允许发起上游调用。
            throw new com.mftb.admin.common.BusinessException(429, e.getMessage());
        } catch (RuntimeException e) {
            log.warn("[LlmMetering] 預算預占失敗 request={}: {}", requestId, e.getMessage());
        }
    }

    /**
     * 拿到上游响应后结算：写用量明细 + 预算结算。
     * <p>上游没回 usage（部分网关会省掉）时不能凭空估一个数入账，直接释放预占并标 UNKNOWN。
     *
     * @param mode   auto / primary / off-peak
     * @param resp   上游 chat/completions 响应（可为 null）
     * @return 本次计入的总 tokens（prompt + completion），未入账返回 0
     */
    public long settle(String requestId, String account, String mode, Channel channel, JsonNode resp) {
        if (channel == null) {
            return NO_USAGE_TOKENS;
        }
        if (resp == null) {
            release(requestId, "empty_response");
            return NO_USAGE_TOKENS;
        }
        JsonNode usage = resp.path("usage");
        if (usage.isMissingNode() || usage.isNull()) {
            release(requestId, "no_usage_field");
            return NO_USAGE_TOKENS;
        }
        int prompt = usage.path("prompt_tokens").asInt(0);
        int completion = usage.path("completion_tokens").asInt(0);
        int cached = usage.path("prompt_tokens_details").path("cached_tokens").asInt(0);
        String model = resp.path("model").asText(channel.getDefaultModelKey());

        LlmUsageRecordRequest record = new LlmUsageRecordRequest();
        record.setMode(mode);
        record.setChannel(channel.getLabel());
        record.setModel(model);
        record.setPromptTokens(prompt);
        record.setCompletionTokens(completion);
        record.setCachedTokens(cached);
        record.setRequestId(requestId);
        try {
            llmUsageService.record(account, record);
        } catch (Exception e) {
            // 已产生真实消耗，记账失败必须留警告；回复仍照常返回给用户
            log.warn("[LlmMetering] 用量上報失敗（結果仍返回）request={} account={} model={}: {}",
                    requestId, account, model, e.getMessage());
        }
        try {
            budgetService.settle(requestId, prompt, completion, cached,
                    channel.getInputPrice(), channel.getOutputPrice(),
                    channel.getCachedInputPrice(), channel.getCurrency());
        } catch (RuntimeException e) {
            log.warn("[LlmMetering] 預算結算失敗 request={}: {}", requestId, e.getMessage());
        }
        return (long) prompt + completion;
    }

    /** 调用失败/取消：释放预占，账上不留费用。 */
    public void release(String requestId, String reason) {
        try {
            budgetService.release(requestId, reason);
        } catch (RuntimeException e) {
            log.warn("[LlmMetering] 預算釋放失敗 request={}: {}", requestId, e.getMessage());
        }
    }

    /** 计量口径：通道配了输入/输出单价才算是 VERIFIED，否则 UNKNOWN（前端显示「未知」而非伪装免费）。 */
    public static String verification(Channel channel) {
        return channel != null && channel.getInputPrice() != null && channel.getOutputPrice() != null
                ? "VERIFIED" : "UNKNOWN";
    }
}
