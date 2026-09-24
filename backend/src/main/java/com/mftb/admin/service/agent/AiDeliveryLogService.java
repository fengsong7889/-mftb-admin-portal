package com.mftb.admin.service.agent;

import com.mftb.admin.entity.AiDeliveryLog;

import java.util.Map;

/**
 * V0 §八 V0-6 通知投递日志：写入不阻断主链路，读取供审计/管理页展示。
 */
public interface AiDeliveryLogService {

    /** 记录一次外部渠道投递结果；status=SENT/FAILED/UNKNOWN。 */
    AiDeliveryLog record(AiDeliveryLog entry);

    /** 分页查询（管理页使用） */
    Map<String, Object> query(long page, long size, String toolKey, String status, String caller);

    /** 收件邮箱脱敏：a***@example.com 格式；保留头尾各 1 字符。 */
    static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return email;
        int at = email.indexOf('@');
        String local = email.substring(0, at);
        String domain = email.substring(at);
        if (local.length() <= 2) return local.charAt(0) + "***" + domain;
        return local.charAt(0) + "***" + local.charAt(local.length() - 1) + domain;
    }

    /** 文本预览：截断至 maxLen 并添加省略号。 */
    static String preview(String text, int maxLen) {
        if (text == null) return null;
        String oneLine = text.replaceAll("\\s+", " ").trim();
        return oneLine.length() <= maxLen ? oneLine : oneLine.substring(0, maxLen) + "…";
    }
}
