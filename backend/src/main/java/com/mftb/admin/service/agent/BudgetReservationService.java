package com.mftb.admin.service.agent;

import lombok.Data;

import java.math.BigDecimal;

/**
 * V0 §B.1 预算流水服务：预占 → 结算 → 释放。
 * <p>状态机（{@code ai_budget_ledger.status}）：
 * <pre>
 *   RESERVED ──settle──▶ SETTLED   （服务端取得真实 usage）
 *           ──release──▶ RELEASED   （失败/取消，无实际 usage 或费用不可确认）
 * </pre>
 * 并发保护：所有状态推进使用条件 UPDATE {@code WHERE status='RESERVED'}，
 * 影响行 0 表示已被其它路径抢先处理，视为幂等成功而非异常。
 */
public interface BudgetReservationService {

    /**
     * 预占一次调用的额度上限。
     * <p>requestId 唯一，同 ID 二次调用命中已有行直接返回旧预占（幂等）。
     * 单价缺失时 reservedCost 记 0，verification_status=UNKNOWN。
     */
    Reservation reserve(String requestId, String username, String modelKey,
                        int promptTokensEst, int completionTokensEst,
                        BigDecimal unitInputPerMillion, BigDecimal unitOutputPerMillion,
                        String currency);

    /** 结算：以服务端实测 tokens 落 actual_*；仅 RESERVED → SETTLED。 */
    void settle(String requestId, int actualPromptTokens, int actualCompletionTokens, int cachedTokens,
                BigDecimal unitInputPerMillion, BigDecimal unitOutputPerMillion,
                BigDecimal cachedUnitInputPerMillion, String currency);

    /** 释放：请求失败/取消但未拿到实际 usage 时调用；仅 RESERVED → RELEASED。 */
    void release(String requestId, String errorMessage);

    /** 预占返回体 */
    @Data
    class Reservation {
        private String requestId;
        private long ledgerId;
        /** 幂等命中已有行时为 false，方便调用方判断是否需要补写事件 */
        private boolean newlyCreated;
    }
}
