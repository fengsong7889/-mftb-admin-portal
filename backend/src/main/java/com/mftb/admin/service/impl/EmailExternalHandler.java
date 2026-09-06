package com.mftb.admin.service.impl;

import com.mftb.admin.service.McpExternalHandler;
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
 * email_sender 外部服務執行器：MCP 執行網關的 SMTP 落地
 * 收件人由 AI 在對話中向用戶確認後傳入（前端已有人工確認彈窗，此處做服務端最後校驗）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmailExternalHandler implements McpExternalHandler {

    private static final Pattern EMAIL = Pattern.compile("^[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+$");

    private final JavaMailSender mailSender;

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
        if (!StringUtils.hasText(host) || !StringUtils.hasText(from)) {
            throw new IllegalStateException("SMTP 未配置：請在 .env 補充 SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD 後重啟後端");
        }
        String to = str(args.get("to"));
        String subject = str(args.get("subject"));
        String content = str(args.get("content"));
        if (!StringUtils.hasText(to) || !EMAIL.matcher(to).matches()) {
            throw new IllegalArgumentException("收件人郵箱無效: " + to + "（AI 應先向用戶確認收件人）");
        }
        if (!StringUtils.hasText(subject) || !StringUtils.hasText(content)) {
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
            throw e;
        } catch (Exception e) {
            log.error("email_sender 發送失敗: to={}", to, e);
            throw new IllegalStateException("郵件發送失敗（請檢查 SMTP 配置與網絡）: " + e.getMessage());
        }
        log.info("[MCP Exec] email_sender 已發送: to={} subject={}", to, subject);
        return "郵件已發送至 " + to + "（主題：" + subject + "）";
    }

    private String str(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }
}
