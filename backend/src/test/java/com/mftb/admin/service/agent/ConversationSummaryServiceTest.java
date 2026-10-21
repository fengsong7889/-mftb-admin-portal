package com.mftb.admin.service.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.client.LlmHttpClient;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AiConversationSummaryVO;
import com.mftb.admin.entity.AiConversation;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiConversationMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 短期摘要：最近 6 条原样保留，只压缩更早的消息；失败不落库、不伪造。
 *
 * <p>历史实现只在前端插入一条「[歷史摘要]」占位文本，模型并不知情；
 * 这里的用例钉住「真的调模型 + 真的写 ai_conversation」这条链路。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConversationSummaryServiceTest {

    @Mock private AiConversationMapper conversationMapper;
    @Mock private OperatorResolver operatorResolver;
    @Mock private LlmChannelRouter channelRouter;
    @Mock private LlmHttpClient llmClient;
    @Mock private LlmMeteringService metering;

    private final ObjectMapper mapper = new ObjectMapper();
    private ConversationSummaryService service;

    @BeforeEach
    void setUp() {
        service = new ConversationSummaryService(conversationMapper, operatorResolver,
                channelRouter, llmClient, metering, mapper);
        SysUser user = new SysUser();
        user.setId(9L);
        when(operatorResolver.currentUser()).thenReturn(user);
        when(operatorResolver.currentOperatorAccount()).thenReturn("alice");
        when(channelRouter.resolveChannel(eq(LlmChannelRouter.CHANNEL_OFF_PEAK), anyString()))
                .thenReturn(channel());
    }

    private static LlmChannelRouter.Channel channel() {
        LlmChannelRouter.Channel c = new LlmChannelRouter.Channel();
        c.setLabel("off-peak");
        c.setBaseUrl("https://api.example.com");
        c.setApiKey("sk-test");
        c.setDefaultModelKey("deepseek-chat");
        return c;
    }

    private AiConversation conversation(int messageCount, String owner) throws Exception {
        List<Map<String, Object>> messages = new ArrayList<>();
        for (int i = 0; i < messageCount; i++) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("role", i % 2 == 0 ? "user" : "assistant");
            m.put("content", "第 " + (i + 1) + " 條消息");
            messages.add(m);
        }
        AiConversation conv = new AiConversation();
        conv.setId(1L);
        conv.setUsername(owner);
        conv.setMessages(mapper.writeValueAsString(messages));
        return conv;
    }

    @Test
    @DisplayName("消息不足以压缩时直接返回 compressed=false，不调用模型")
    void skipsWhenTooFewMessages() throws Exception {
        when(conversationMapper.selectById(1L)).thenReturn(conversation(7, "alice"));

        AiConversationSummaryVO vo = service.summarize(1L);

        assertFalse(vo.isCompressed());
        assertEquals(6, vo.getKeptCount());
        verify(llmClient, never()).chatCompletion(any(), any(), any());
        verify(conversationMapper, never()).updateById(any(AiConversation.class));
    }

    @Test
    @DisplayName("成功摘要只覆盖最近 6 条之外的消息，并写入三列")
    void summarizesOlderMessagesAndPersists() throws Exception {
        when(conversationMapper.selectById(1L)).thenReturn(conversation(10, "alice"));
        JsonNode resp = mapper.readTree("{\"model\":\"m-1\",\"choices\":[{\"message\":{\"content\":\" 用戶在做日報推送 \"}}]}");
        when(llmClient.chatCompletion(any(), any(), any())).thenReturn(resp);
        when(metering.settle(any(), any(), any(), any(), any())).thenReturn(33L);

        AiConversationSummaryVO vo = service.summarize(1L);

        assertTrue(vo.isCompressed());
        assertEquals("用戶在做日報推送", vo.getSummary());
        assertEquals(4, vo.getCoveredCount());
        assertEquals(33L, vo.getTokens());
        assertEquals("m-1", vo.getModel());

        ArgumentCaptor<AiConversation> cap = ArgumentCaptor.forClass(AiConversation.class);
        verify(conversationMapper).updateById(cap.capture());
        AiConversation update = cap.getValue();
        assertEquals(1L, update.getId());
        assertEquals("用戶在做日報推送", update.getSummary());
        assertEquals(4, update.getSummaryMessageCount());
        assertNotNull(update.getSummaryUpdatedAt());
        verify(metering).reserve(any(), eq("alice"), any(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("模型返回空内容时记失败并释放预占，不写入空摘要")
    void rejectsEmptyModelOutput() throws Exception {
        when(conversationMapper.selectById(1L)).thenReturn(conversation(10, "alice"));
        when(llmClient.chatCompletion(any(), any(), any())).thenReturn(
                mapper.readTree("{\"choices\":[{\"message\":{\"content\":\"   \"}}]}"));

        assertThrows(BusinessException.class, () -> service.summarize(1L));

        verify(metering).release(any(), eq("empty_summary"));
        verify(conversationMapper, never()).updateById(any(AiConversation.class));
    }

    @Test
    @DisplayName("上游逾时按类别释放预占，并给出可重试文案")
    void releasesOnUpstreamTimeout() throws Exception {
        when(conversationMapper.selectById(1L)).thenReturn(conversation(10, "alice"));
        when(llmClient.chatCompletion(any(), any(), any())).thenThrow(
                new LlmHttpClient.LlmCallException(LlmHttpClient.Category.TIMEOUT, null, "上游讀取逾時"));

        BusinessException e = assertThrows(BusinessException.class, () -> service.summarize(1L));

        assertTrue(e.getMessage().contains("逾時"), e.getMessage());
        verify(metering).release(any(), eq("TIMEOUT"));
        verify(conversationMapper, never()).updateById(any(AiConversation.class));
    }

    @Test
    @DisplayName("不能摘要他人会话")
    void rejectsOtherUsersConversation() throws Exception {
        when(conversationMapper.selectById(1L)).thenReturn(conversation(10, "bob"));

        BusinessException e = assertThrows(BusinessException.class, () -> service.summarize(1L));

        assertTrue(e.getMessage().contains("無權"), e.getMessage());
        verify(llmClient, never()).chatCompletion(any(), any(), any());
    }

    @Test
    @DisplayName("消息 JSON 损坏时按无可摘要内容处理，不抛系统异常")
    void toleratesBrokenMessageJson() {
        AiConversation conv = new AiConversation();
        conv.setId(1L);
        conv.setUsername("alice");
        conv.setMessages("not-json");
        when(conversationMapper.selectById(1L)).thenReturn(conv);

        AiConversationSummaryVO vo = service.summarize(1L);

        assertFalse(vo.isCompressed());
        verify(llmClient, never()).chatCompletion(any(), any(), any());
    }
}
