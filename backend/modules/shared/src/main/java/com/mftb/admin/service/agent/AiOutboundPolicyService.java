package com.mftb.admin.service.agent;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 每轮最终载荷的出域边界；未建立分类与可信端点登记前保持阻断，绝不按 private 标签放行。 */
@Service
@RequiredArgsConstructor
public class AiOutboundPolicyService {
    private final AiGuardrailService guardrails;
    /** 数据分级与端点批准：未分级/未批准一律拒绝，private 标签不能代替批准。 */
    private final com.mftb.admin.service.agent.platform.AiDataPolicyService dataPolicy;
    private static final Set<String> PROTOCOL_FIELDS = Set.of("role", "type", "name", "id", "tool_call_id", "model");

    public record Prepared(AiModelAdmissionService.Decision decision, Map<String, Object> payload) { }

    public Prepared prepare(LlmChannelRouter.Channel channel, Map<String, Object> payload, String systemCode) {
        try {
            if (channel == null || payload == null || !(payload.get("messages") instanceof List<?>)) {
                return denied("outbound_invalid", "模型請求內容無法確認");
            }
            // 先检查实际完整载荷；包含历史、系统提示、工具结果、记忆和摘要，而不是只查最后一句。
            Map<String, Object> sanitized = (Map<String, Object>) sanitize(payload, systemCode, "", 0);
            String modelKey = sanitized.get("model") == null ? channel.getDefaultModelKey()
                    : String.valueOf(sanitized.get("model"));
            var policy = dataPolicy.evaluate(systemCode, modelKey);
            if (policy == null || !policy.allowed()) {
                return denied(policy == null ? "data_policy_unavailable" : policy.errorKind(),
                        policy == null ? "無法確認數據准入策略" : policy.message());
            }
            // 发送检查后的副本，不能“检查 A、发送 B”。
            return new Prepared(new AiModelAdmissionService.Decision(null, null, 200), sanitized);
        } catch (RuntimeException e) {
            return denied("outbound_policy_unavailable", "無法確認出域安全策略，本次未調用模型");
        }
    }

    private Object sanitize(Object value, String scope, String key, int depth) {
        if (depth > 24) throw new IllegalArgumentException("載荷層級超限");
        if (value instanceof String text) {
            AiGuardrailService.GuardResult result = guardrails.checkInput(text, scope);
            if (result == null || result.isBlocked()) throw new IllegalArgumentException("安全規則拒絕");
            String sanitized = result.getText();
            if (sanitized == null || PROTOCOL_FIELDS.contains(key) && !text.equals(sanitized)) {
                throw new IllegalArgumentException("不能改寫協議欄位");
            }
            return sanitized;
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> safe = new LinkedHashMap<>();
            for (var entry : map.entrySet()) {
                if (!(entry.getKey() instanceof String field)) throw new IllegalArgumentException("無效欄位");
                safe.put(field, sanitize(entry.getValue(), scope, field, depth + 1));
            }
            return safe;
        }
        if (value instanceof List<?> list) {
            List<Object> safe = new ArrayList<>();
            for (Object item : list) safe.add(sanitize(item, scope, key, depth + 1));
            return safe;
        }
        if (value == null || value instanceof Boolean || value instanceof Number) return value;
        throw new IllegalArgumentException("無效載荷類型");
    }

    private Prepared denied(String kind, String message) {
        return new Prepared(new AiModelAdmissionService.Decision(kind, message, 503), Map.of());
    }
}
