package com.mftb.admin.service.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.LlmUsageRecordRequest;
import com.mftb.admin.service.LlmUsageService;
import com.mftb.admin.service.agent.LlmChannelRouter.Channel;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * LLM 计量与预算结算的行为锁。
 * <p>背景：问答走 {@code /api/agent/orchestrate} 时完全不落账（账本 0 行，而会话表已记上万 token），
 * 「我的用量」「能耗統計」恒为 0，额度与预算管控失去依据。本服务是编排链路与网关唯一的计量出口，
 * 因此三态（预占 / 结算 / 释放）以及「记账失败不许吞掉回复」都必须钉住。
 */
@ExtendWith(MockitoExtension.class)
class LlmMeteringServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Mock private LlmUsageService llmUsageService;
    @Mock private BudgetReservationService budgetService;

    @InjectMocks private LlmMeteringService metering;

    private static Channel channel() {
        Channel ch = new Channel();
        ch.setLabel("primary");
        ch.setBaseUrl("https://dashscope.aliyuncs.com/compatible-mode/v1");
        ch.setApiKey("sk-xxx");
        ch.setDefaultModelKey("qwen3.7-flash");
        ch.setInputPrice(new BigDecimal("0.2"));
        ch.setOutputPrice(new BigDecimal("0.8"));
        ch.setCachedInputPrice(new BigDecimal("0.04"));
        ch.setCurrency("CNY");
        return ch;
    }

    @Test
    @DisplayName("预占按登录账号记账，模型取通道默认模型")
    void reserveUsesLoginAccountAndChannelModel() {
        metering.reserve("req-1", "MF00001", channel(), 400, 2048);

        verify(budgetService).reserve(eq("req-1"), eq("MF00001"), eq("qwen3.7-flash"),
                eq(400), eq(2048), any(), any(), any());
    }

    @Test
    @DisplayName("结算写用量明细并推进预算到 SETTLED")
    void settleRecordsUsageAndSettlesBudget() throws Exception {
        var resp = MAPPER.readTree("{\"model\":\"qwen3.7-flash\",\"usage\":"
                + "{\"prompt_tokens\":120,\"completion_tokens\":80,"
                + "\"prompt_tokens_details\":{\"cached_tokens\":40}}}");

        long charged = metering.settle("req-2", "MF00001", "auto", channel(), resp);

        assertEquals(200L, charged);
        ArgumentCaptor<LlmUsageRecordRequest> cap = ArgumentCaptor.forClass(LlmUsageRecordRequest.class);
        verify(llmUsageService).record(eq("MF00001"), cap.capture());
        LlmUsageRecordRequest saved = cap.getValue();
        assertEquals("qwen3.7-flash", saved.getModel());
        assertEquals("primary", saved.getChannel());
        assertEquals("auto", saved.getMode());
        assertEquals(120, saved.getPromptTokens());
        assertEquals(80, saved.getCompletionTokens());
        assertEquals(40, saved.getCachedTokens());
        assertEquals("req-2", saved.getRequestId());
        verify(budgetService).settle(eq("req-2"), eq(120), eq(80), eq(40), any(), any(), any(), eq("CNY"));
    }

    /** 上游没回 usage 时不能凭空估一个数入账，只能释放预占（账上不留假费用）。 */
    @Test
    @DisplayName("上游缺 usage 字段：释放预占且不写明细")
    void missingUsageReleasesReservation() throws Exception {
        var resp = MAPPER.readTree("{\"model\":\"qwen3.7-flash\"}");

        long charged = metering.settle("req-3", "MF00001", "auto", channel(), resp);

        assertEquals(0L, charged);
        verify(llmUsageService, never()).record(any(), any());
        verify(budgetService).release(eq("req-3"), eq("no_usage_field"));
    }

    @Test
    @DisplayName("响应为 null：释放预占，原因 empty_response")
    void nullResponseReleasesReservation() {
        assertEquals(0L, metering.settle("req-4", "MF00001", "auto", channel(), null));
        verify(budgetService).release(eq("req-4"), eq("empty_response"));
    }

    /**
     * 已经真实消耗的 token 不能因为记账异常就丢掉：明细失败要照常结算预算并留日志，
     * 反过来预算结算失败也不能把已上报的明细回滚掉。
     */
    @Test
    @DisplayName("记账异常不阻断：明细失败仍继续结算预算")
    void usageRecordFailureDoesNotBlockSettlement() throws Exception {
        var resp = MAPPER.readTree("{\"model\":\"m\",\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}");
        doThrow(new RuntimeException("db down")).when(llmUsageService).record(any(), any());

        long charged = metering.settle("req-5", "MF00001", "auto", channel(), resp);

        assertEquals(15L, charged);
        verify(budgetService).settle(eq("req-5"), eq(10), eq(5), eq(0), any(), any(), any(), eq("CNY"));
    }

    @Test
    @DisplayName("预占失败只留警告，不影响问答")
    void reserveFailureIsNonFatal() {
        doThrow(new RuntimeException("ledger locked")).when(budgetService)
                .reserve(any(), any(), any(), anyInt(), anyInt(), any(), any(), any());

        metering.reserve("req-6", "MF00001", channel(), 200, 2048);

        // 不抛出即通过：问答不能因账本问题被打断
    }

    @Test
    @DisplayName("单价齐全才算 VERIFIED，缺单价标 UNKNOWN（不许伪装成免费）")
    void verificationFlagFollowsPriceConfig() {
        assertEquals("VERIFIED", LlmMeteringService.verification(channel()));

        Channel noPrice = channel();
        noPrice.setOutputPrice(null);
        assertEquals("UNKNOWN", LlmMeteringService.verification(noPrice));
    }
}
