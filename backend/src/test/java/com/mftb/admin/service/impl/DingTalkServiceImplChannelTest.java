package com.mftb.admin.service.impl;

import com.mftb.admin.entity.SysNotificationChannel;
import com.mftb.admin.mapper.SysNotificationChannelMapper;
import com.mftb.admin.service.DingTalkService.SendOutcome;
import com.mftb.admin.service.NotificationChannelService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 按渠道精确发送的安全口径测试（会议纪要发群走这条路）。
 *
 * <p>这条方法与既有的场景路由法唯一的区别就是它的存在理由：<b>绝不回退默认渠道</b>。
 * 会议纪要是要进一个具体群的内部结论，回退一次就等于把纪要发进谁都没确认过的群，
 * 而且是静默发生的——群里的人看见了，发送方却不知道。所以这里逐条钉住：
 * 渠道不存在 / 已停用 / 不是钉钉 / 没配 webhook，四种情况都必须<b>零外调</b>（不是"发不出去就算了"，
 * 而是"绝不能换成别的群发出去"）；网络异常时不得把带 access_token 的完整 URL 回传到上下文里。
 */
class DingTalkServiceImplChannelTest {

    private static final String SELECTED_HOOK = "https://oapi.dingtalk.com/robot/send?access_token=SELECTED";
    private static final String DEFAULT_HOOK = "https://oapi.dingtalk.com/robot/send?access_token=DEFAULTGROUP";

    private NotificationChannelService channelService;
    private SysNotificationChannelMapper channelMapper;
    private RestTemplate restTemplate;
    private DingTalkServiceImpl service;

    private static SysNotificationChannel channel(long id, String name, String platform, int enabled, String webhook) {
        SysNotificationChannel row = new SysNotificationChannel();
        row.setId(id);
        row.setName(name);
        row.setChannel(platform);
        row.setEnabled(enabled);
        row.setWebhookUrl(webhook);
        row.setSecret("");
        row.setIsDefault(id == 9L ? 1 : 0);
        return row;
    }

    @BeforeEach
    void setUp() {
        channelService = mock(NotificationChannelService.class);
        channelMapper = mock(SysNotificationChannelMapper.class);
        restTemplate = mock(RestTemplate.class);
        service = new DingTalkServiceImpl(channelService, channelMapper, restTemplate);
        // 平台上存在一个"默认群"渠道：任何一次回退都会把纪要发进它，测试要能看得见有没有回退
        when(channelMapper.selectById(9L)).thenReturn(channel(9L, "默認釘釘群", "dingtalk", 1, DEFAULT_HOOK));
        when(channelService.findDefault("dingtalk")).thenReturn(channel(9L, "默認釘釘群", "dingtalk", 1, DEFAULT_HOOK));
    }

    @Test
    @DisplayName("选中的群渠道可用时只发它，不回退默认渠道")
    void sendsOnlyToSelectedChannel() {
        when(channelMapper.selectById(3L)).thenReturn(channel(3L, "行政通知群", "dingtalk", 1, SELECTED_HOOK));
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class))).thenReturn(Map.of("errcode", 0, "errmsg", "ok"));

        SendOutcome outcome = service.sendMarkdownSyncToChannel(3L, "標題", "正文", List.of(), false);

        assertTrue(outcome.channelAccepted());
        assertEquals("行政通知群", outcome.channelName());
        ArgumentCaptor<String> url = ArgumentCaptor.forClass(String.class);
        verify(restTemplate).postForObject(url.capture(), any(), eq(Map.class));
        assertTrue(url.getValue().contains("SELECTED"), "实际请求地址必须是被选中的群：" + url.getValue());
        assertFalse(url.getValue().contains("DEFAULTGROUP"), "绝不能发到默认渠道");
    }

    @Test
    @DisplayName("渠道不存在：未受理且零外调（不能拿默认群顶替）")
    void missingChannelSendsNothing() {
        when(channelMapper.selectById(77L)).thenReturn(null);

        SendOutcome outcome = service.sendMarkdownSyncToChannel(77L, "標題", "正文", null, false);

        assertFalse(outcome.channelAccepted());
        assertEquals("channel_not_found", outcome.errmsg());
        verify(restTemplate, never()).postForObject(anyString(), any(), any());
    }

    @Test
    @DisplayName("渠道被停用：未受理且零外调")
    void disabledChannelSendsNothing() {
        when(channelMapper.selectById(4L)).thenReturn(channel(4L, "已停用群", "dingtalk", 0, SELECTED_HOOK));

        SendOutcome outcome = service.sendMarkdownSyncToChannel(4L, "標題", "正文", null, false);

        assertFalse(outcome.channelAccepted());
        assertEquals("channel_disabled", outcome.errmsg());
        verify(restTemplate, never()).postForObject(anyString(), any(), any());
    }

    @Test
    @DisplayName("非钉钉平台渠道（如飞书）：未受理且零外调，不能拿别的 IM 发内部纪要")
    void otherPlatformChannelSendsNothing() {
        when(channelMapper.selectById(5L)).thenReturn(channel(5L, "飛書群", "feishu", 1, SELECTED_HOOK));

        SendOutcome outcome = service.sendMarkdownSyncToChannel(5L, "標題", "正文", null, false);

        assertFalse(outcome.channelAccepted());
        assertEquals("channel_platform_not_dingtalk", outcome.errmsg());
        verify(restTemplate, never()).postForObject(anyString(), any(), any());
    }

    @Test
    @DisplayName("渠道启用了但没配 webhook：未受理且零外调")
    void channelWithoutWebhookSendsNothing() {
        when(channelMapper.selectById(6L)).thenReturn(channel(6L, "缺地址群", "dingtalk", 1, ""));

        SendOutcome outcome = service.sendMarkdownSyncToChannel(6L, "標題", "正文", null, false);

        assertFalse(outcome.channelAccepted());
        assertEquals("channel_webhook_missing", outcome.errmsg());
        verify(restTemplate, never()).postForObject(anyString(), any(), any());
    }

    @Test
    @DisplayName("网络异常只回异常类型：异常文本里带着含 access_token 的完整地址，不得进上下文")
    void networkFailureDoesNotLeakWebhookToken() {
        when(channelMapper.selectById(3L)).thenReturn(channel(3L, "行政通知群", "dingtalk", 1, SELECTED_HOOK));
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class)))
                .thenThrow(new ResourceAccessException("I/O error on POST request for \"" + SELECTED_HOOK + "\": timeout"));

        SendOutcome outcome = service.sendMarkdownSyncToChannel(3L, "標題", "正文", null, false);

        assertFalse(outcome.channelAccepted());
        assertEquals("ResourceAccessException", outcome.errmsg());
        assertFalse(outcome.errmsg().contains("access_token"), outcome.errmsg());
    }

    @Test
    @DisplayName("钉钉返回非零错误码时按未受理返回，由调用方留痕原因")
    void rejectedErrorCodeIsNotAccepted() {
        when(channelMapper.selectById(3L)).thenReturn(channel(3L, "行政通知群", "dingtalk", 1, SELECTED_HOOK));
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class)))
                .thenReturn(Map.of("errcode", 130101, "errmsg", "token is not exist"));

        SendOutcome outcome = service.sendMarkdownSyncToChannel(3L, "標題", "正文", null, false);

        assertFalse(outcome.channelAccepted());
        assertEquals("130101", outcome.errcode());
    }

    @Test
    @DisplayName("群机器人卡片：正文键是 text、按钮是驼峰 singleTitle/singleURL（与工作通知协议不同）")
    @SuppressWarnings("unchecked")
    void actionCardUsesRobotProtocol() {
        when(channelService.findByScenario("rdm")).thenReturn(channel(3L, "研發群", "dingtalk", 1, SELECTED_HOOK));
        when(restTemplate.postForObject(anyString(), any(), eq(Map.class)))
                .thenReturn(Map.of("errcode", 0, "errmsg", "ok"));

        SendOutcome outcome = service.sendActionCardSync("rdm", "產研交付日報 10-20 晨報｜逾期 2",
                "**在途 2｜逾期 2**", "查看完整日報", "https://portal.example/#/rdm-daily-view?token=x");

        assertTrue(outcome.channelAccepted());
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(restTemplate).postForObject(anyString(), body.capture(), eq(Map.class));
        assertEquals("actionCard", body.getValue().get("msgtype"));
        Map<String, Object> card = (Map<String, Object>) body.getValue().get("actionCard");
        assertEquals("**在途 2｜逾期 2**", card.get("text"));
        assertEquals("查看完整日報", card.get("singleTitle"));
        assertEquals("https://portal.example/#/rdm-daily-view?token=x", card.get("singleURL"));
        // 工作通知的下划线字段写进群机器人会被当成参数错误，必须锁住
        assertFalse(card.containsKey("single_title"));
        assertFalse(card.containsKey("markdown"));
        // ActionCard 不支持 @ 人，不得发出一个看着 @ 了实际没 @ 的 at 节点
        assertFalse(body.getValue().containsKey("at"));
    }
}
