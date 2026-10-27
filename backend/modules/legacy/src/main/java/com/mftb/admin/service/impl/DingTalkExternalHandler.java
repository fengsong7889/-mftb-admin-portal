package com.mftb.admin.service.impl;

import com.mftb.admin.entity.AiDeliveryLog;
import com.mftb.admin.service.DingTalkService;
import com.mftb.admin.service.DingTalkService.SendOutcome;
import com.mftb.admin.service.McpExternalHandler;
import com.mftb.admin.service.agent.AiDeliveryLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * dingtalk_sender 外部服务执行器（V0 §八 V0-6 升级：改走同步接口 + 回写投递日志）。
 * <p>业务通知继续走 @Async sendText/sendMarkdown；AI 工具执行必须知道渠道是否受理，
 * 因此走 sendTextSync / sendMarkdownSync，且把结果写入 ai_delivery_log。
 * <p>SENT 仅代表钉钉侧返回 errcode=0；渠道本身不提供送达/已读回执。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DingTalkExternalHandler implements McpExternalHandler {

    private final DingTalkService dingTalkService;
    private final AiDeliveryLogService deliveryLogService;

    @Override
    public String toolKey() {
        return "dingtalk_sender";
    }

    @Override
    public String execute(Map<String, Object> args) {
        return execute(args, new ToolCallContext(null, null, null));
    }

    @Override
    public String execute(Map<String, Object> args, ToolCallContext ctx) {
        if (!dingTalkService.isEnabled()) {
            recordFailure(ctx, "钉钉渠道未启用", "CONFIG_DISABLED", null);
            throw new IllegalStateException("釘釘通知未啟用：請在通知渠道配置中配置 Webhook 地址並開啟開關");
        }
        String content = str(args.get("content"));
        if (!StringUtils.hasText(content)) {
            recordFailure(ctx, "content 為空", "PARAM_MISSING", null);
            throw new IllegalArgumentException("content 為必填參數（AI 應先向用戶確認消息內容）");
        }
        String msgType = str(args.get("msgType"));
        String atMobilesStr = str(args.get("atMobiles"));
        List<String> atMobiles = StringUtils.hasText(atMobilesStr)
                ? Arrays.asList(atMobilesStr.split(","))
                : Collections.emptyList();

        SendOutcome outcome = "text".equalsIgnoreCase(msgType)
                ? dingTalkService.sendTextSync("ai_assistant", content, atMobiles, false)
                : dingTalkService.sendMarkdownSync("ai_assistant", "AI 助手通知", content, atMobiles, false);

        recordDelivery(ctx, outcome, content);
        if (!outcome.channelAccepted()) {
            throw new IllegalStateException("釘釘渠道拒絕：errcode=" + outcome.errcode() + " errmsg=" + outcome.errmsg());
        }
        return "釘釘消息已被渠道受理（群：" + nullSafe(outcome.channelName())
                + "；內容長度 " + content.length() + " 字符；渠道不保證送達/已讀）";
    }

    private void recordDelivery(ToolCallContext ctx, SendOutcome outcome, String content) {
        AiDeliveryLog row = baseEntry(ctx);
        row.setStatus(outcome.channelAccepted() ? "SENT" : "FAILED");
        row.setExternalErrcode(outcome.errcode());
        row.setErrorMessage(outcome.channelAccepted() ? null : outcome.errmsg());
        row.setRecipientSummary(nullSafe(outcome.channelName()));
        row.setSubjectPreview(AiDeliveryLogService.preview(content, 100));
        deliveryLogService.record(row);
    }

    private void recordFailure(ToolCallContext ctx, String reason, String code, String content) {
        AiDeliveryLog row = baseEntry(ctx);
        row.setStatus("FAILED");
        row.setExternalErrcode(code);
        row.setErrorMessage(reason);
        row.setSubjectPreview(AiDeliveryLogService.preview(content, 100));
        deliveryLogService.record(row);
    }

    private AiDeliveryLog baseEntry(ToolCallContext ctx) {
        AiDeliveryLog row = new AiDeliveryLog();
        row.setToolKey(toolKey());
        row.setChannel("dingtalk");
        if (ctx != null) {
            row.setCaller(ctx.caller());
            row.setConversationPk(ctx.conversationPk());
            row.setConversationId(ctx.conversationId());
        }
        row.setAttempts(1);
        return row;
    }

    private static String nullSafe(String s) { return s == null ? "-" : s; }

    private String str(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }
}
