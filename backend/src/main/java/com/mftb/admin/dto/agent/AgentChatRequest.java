package com.mftb.admin.dto.agent;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.service.agent.AgentOrchestrationService.OrchestrateRequest;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** 普通 HTTP 请求不能构造内部试跑命令或提交可信工具执行事实。 */
@Data
@Schema(description = "生产聊天请求；仅接收普通消息与待校验上下文，不接受试跑、审批或工具执行字段")
public class AgentChatRequest {
    private List<Map<String, Object>> messages;
    private Long conversationPk;
    private String mode = "auto";
    private String systemCode;
    /** 应用标识：服务端据此加载发布版本的工具白名单，未发布直接拒绝。 */
    private String applicationKey;
    /** 前端 UX 提示，不参与安全裁决；服务端仍按固定轮次与上限执行。单位为 tokens（前端档位 64K~2M）。 */
    private Integer contextWindow;
    private String thinkingDepth;

    /**
     * 上下文窗口上限（tokens）。
     * <p>必须与 AuthController 保存 AI 设置时的白名单口径一致，并对齐前端档位（64K~2M）。
     * 该值仅作 UX 提示，不写入编排命令、不参与安全裁决，故只做数量级防呆而非业务限额。
     */
    private static final int MAX_CONTEXT_WINDOW_TOKENS = 10_000_000;

    @JsonAnySetter
    public void rejectUnknown(String key, Object value) {
        throw invalid();
    }

    public OrchestrateRequest toCommand() {
        validateMessages(messages);
        if (mode != null && !Set.of("auto", "primary", "off-peak").contains(mode)) throw invalid();
        if (conversationPk != null && conversationPk <= 0) throw invalid();
        if (systemCode != null && (systemCode.length() > 32 || !systemCode.matches("[a-z][a-z0-9-]*"))) throw invalid();
        if (applicationKey != null && !applicationKey.matches("[a-z][a-z0-9-]{2,63}")) throw invalid();
        if (contextWindow != null && (contextWindow < 1 || contextWindow > MAX_CONTEXT_WINDOW_TOKENS)) throw invalid();
        if (thinkingDepth != null && !Set.of("low", "medium", "high", "xhigh", "max").contains(thinkingDepth)) throw invalid();
        OrchestrateRequest command = new OrchestrateRequest();
        command.setMessages(messages);
        command.setConversationPk(conversationPk);
        command.setMode(mode == null ? "auto" : mode);
        command.setSystemCode(systemCode);
        command.setApplicationKey(applicationKey);
        return command;
    }

    public static void validateCompatibility(Map<String, Object> body) {
        if (body == null || !Set.of("model", "messages", "temperature", "max_tokens", "top_p").containsAll(body.keySet())) throw invalid();
        validateMessages(body.get("messages"));
        Object max = body.get("max_tokens");
        if (max != null && (!(max instanceof Number n) || n.doubleValue() != n.intValue() || n.intValue() < 1 || n.intValue() > 8192)) throw invalid();
        for (String key : List.of("temperature", "top_p")) {
            Object value = body.get(key);
            double ceiling = "top_p".equals(key) ? 1 : 2;
            if (value != null && (!(value instanceof Number n) || !Double.isFinite(n.doubleValue()) || n.doubleValue() < 0 || n.doubleValue() > ceiling)) throw invalid();
        }
    }

    public static void validateMessages(Object input) {
        if (!(input instanceof List<?> messages) || messages.isEmpty() || messages.size() > 200) throw invalid();
        long chars = 0;
        for (Object item : messages) {
            if (!(item instanceof Map<?, ?> message) || !Set.of("role", "content").containsAll(message.keySet())) throw invalid();
            if (!Set.of("user", "assistant").contains(String.valueOf(message.get("role")))) throw invalid();
            Object content = message.get("content");
            if (content instanceof String text) {
                if (text.length() > 32_768) throw invalid();
                chars += text.length();
            } else if (content instanceof List<?> parts && !parts.isEmpty() && parts.size() <= 20) {
                for (Object part : parts) {
                    if (!(part instanceof Map<?, ?> block)) throw invalid();
                    if ("text".equals(block.get("type")) && Set.of("type", "text").containsAll(block.keySet())
                            && block.get("text") instanceof String text && text.length() <= 32_768) {
                        chars += text.length();
                    } else {
                        // 尚无可信附件分类／隔离解析通道，不把任意 URL 或二进制当成普通文本外发。
                        throw new BusinessException(400, "attachment_policy_not_ready：附件安全處理尚未就緒");
                    }
                }
            } else throw invalid();
            if (chars > 524_288) throw invalid();
        }
    }

    private static BusinessException invalid() {
        return new BusinessException(400, "invalid_agent_request：請求包含不支援的欄位、訊息角色或超出限制");
    }
}
