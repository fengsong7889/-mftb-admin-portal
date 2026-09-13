package com.mftb.admin.service.impl;

import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.McpExternalHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * dingtalk_sender 外部服務執行器：MCP 執行網關的釘釘 Webhook 落地
 * 消息內容由 AI 在對話中向用戶確認後傳入（前端已有人工確認彈窗，此處做服務端最後校驗）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DingTalkExternalHandler implements McpExternalHandler {

    private final DingTalkService dingTalkService;

    @Override
    public String toolKey() {
        return "dingtalk_sender";
    }

    @Override
    public String execute(Map<String, Object> args) {
        if (!dingTalkService.isEnabled()) {
            throw new IllegalStateException("釘釘通知未啟用：請在通知渠道配置中配置 Webhook 地址並開啟開關");
        }

        String content = str(args.get("content"));
        if (!StringUtils.hasText(content)) {
            throw new IllegalArgumentException("content 為必填參數（AI 應先向用戶確認消息內容）");
        }

        String msgType = str(args.get("msgType"));
        String atMobilesStr = str(args.get("atMobiles"));
        List<String> atMobiles = StringUtils.hasText(atMobilesStr)
                ? Arrays.asList(atMobilesStr.split(","))
                : Collections.emptyList();

        if ("text".equalsIgnoreCase(msgType)) {
            dingTalkService.sendText(content, atMobiles, false);
        } else {
            dingTalkService.sendMarkdown("AI 助手通知", content, atMobiles, false);
        }

        log.info("[MCP Exec] dingtalk_sender 已發送: msgType={}, contentLen={}", msgType, content.length());
        return "釘釘消息已發送到群聊（內容長度: " + content.length() + " 字符）";
    }

    private String str(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }
}
