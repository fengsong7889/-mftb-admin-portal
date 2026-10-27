package com.mftb.admin.service.impl;

import com.mftb.admin.entity.AiDeliveryLog;
import com.mftb.admin.service.McpExternalHandler;
import com.mftb.admin.service.agent.AiDeliveryLogService;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * email_sender 外部服务执行器（V0 §八 V0-6 升级：每次投递回写 ai_delivery_log）。
 * <p>SMTP 本身是同步接口：{@code mailSender.send} 不抛即视为渠道已接收；
 * SENT 不代表已到达对方邮箱（对方服务器可能退回），渠道侧不提供更进一步的回执。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmailExternalHandler implements McpExternalHandler {

    private static final Pattern EMAIL = Pattern.compile("^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$");

    private final JavaMailSender mailSender;
    private final AiDeliveryLogService deliveryLogService;

    @Value("${spring.mail.host:}")
    private String host;

    @Value("${spring.mail.username:}")
    private String from;

    @Override
    public String toolKey() {
        return "email_sender";
    }

    @Override
    public String execute(Map<String, Object> args) {
        return execute(args, new ToolCallContext(null, null, null));
    }

    @Override
    public String execute(Map<String, Object> args, ToolCallContext ctx) {
        if (!StringUtils.hasText(host) || !StringUtils.hasText(from)) {
            recordFailure(ctx, "SMTP 未配置", "CONFIG_MISSING", null, null);
            throw new IllegalStateException("SMTP 未配置：請在 .env 補充 SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD 後重啟後端");
        }
        String to = str(args.get("to"));
        String subject = str(args.get("subject"));
        String content = str(args.get("content"));
        if (!StringUtils.hasText(to) || !EMAIL.matcher(to).matches()) {
            recordFailure(ctx, "收件人郵箱無效: " + to, "PARAM_INVALID", to, subject);
            throw new IllegalArgumentException("收件人郵箱無效: " + to + "（AI 應先向用戶確認收件人）");
        }
        if (!StringUtils.hasText(subject) || !StringUtils.hasText(content)) {
            recordFailure(ctx, "subject/content 為空", "PARAM_MISSING", to, subject);
            throw new IllegalArgumentException("subject 與 content 為必填參數");
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(content, false);
            mailSender.send(message);
        } catch (IllegalStateException e) {
            recordFailure(ctx, e.getMessage(), "SMTP_ILLEGAL_STATE", to, subject);
            throw e;
        } catch (Exception e) {
            log.error("email_sender 發送失敗: to={}", to, e);
            recordFailure(ctx, e.getClass().getSimpleName() + ": " + e.getMessage(), "SMTP_EXCEPTION", to, subject);
            throw new IllegalStateException("郵件發送失敗（請檢查 SMTP 配置與網絡）: " + e.getMessage());
        }
        recordSuccess(ctx, to, subject);
        log.info("[MCP Exec] email_sender 已投递: to={} subject={}", AiDeliveryLogService.maskEmail(to), subject);
        return "郵件已被 SMTP 服務器接收（收件：" + AiDeliveryLogService.maskEmail(to)
                + "；主題：" + subject + "；不代表已送達對方郵箱）";
    }

    private void recordSuccess(ToolCallContext ctx, String to, String subject) {
        AiDeliveryLog row = baseEntry(ctx);
        row.setStatus("SENT");
        row.setExternalErrcode("250");
        row.setRecipientSummary(AiDeliveryLogService.maskEmail(to));
        row.setSubjectPreview(AiDeliveryLogService.preview(subject, 100));
        deliveryLogService.record(row);
    }

    private void recordFailure(ToolCallContext ctx, String reason, String code, String to, String subject) {
        AiDeliveryLog row = baseEntry(ctx);
        row.setStatus("FAILED");
        row.setExternalErrcode(code);
        row.setErrorMessage(reason);
        if (to != null) row.setRecipientSummary(AiDeliveryLogService.maskEmail(to));
        row.setSubjectPreview(AiDeliveryLogService.preview(subject, 100));
        deliveryLogService.record(row);
    }

    private AiDeliveryLog baseEntry(ToolCallContext ctx) {
        AiDeliveryLog row = new AiDeliveryLog();
        row.setToolKey(toolKey());
        row.setChannel("email");
        if (ctx != null) {
            row.setCaller(ctx.caller());
            row.setConversationPk(ctx.conversationPk());
            row.setConversationId(ctx.conversationId());
        }
        row.setAttempts(1);
        return row;
    }

    private String str(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }
}
