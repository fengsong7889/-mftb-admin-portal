package com.mftb.admin.service.agent.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.entity.AiBudgetLedger;
import com.mftb.admin.mapper.AiBudgetLedgerMapper;
import com.mftb.admin.service.agent.BudgetReservationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * V0 §B.1 预算流水实现：requestId 唯一索引 + 条件 UPDATE 实现幂等；
 * 并发下第二次进入 0 行影响视为已被他方处理，不重复扣减、不抛异常。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BudgetReservationServiceImpl implements BudgetReservationService {

    private static final BigDecimal MILLION = BigDecimal.valueOf(1_000_000);
    private static final String STATUS_RESERVED = "RESERVED";
    private static final String STATUS_SETTLED = "SETTLED";
    private static final String STATUS_RELEASED = "RELEASED";

    private final AiBudgetLedgerMapper ledgerMapper;

    @Override
    @Transactional(rollbackFor = Exception.class, propagation = Propagation.REQUIRED)
    public Reservation reserve(String requestId, String username, String modelKey,
                               int promptTokensEst, int completionTokensEst,
                               BigDecimal unitInputPerMillion, BigDecimal unitOutputPerMillion,
                               String currency) {
        if (!StringUtils.hasText(requestId) || !StringUtils.hasText(username)) {
            throw new IllegalArgumentException("requestId / username 不能为空");
        }
        AiBudgetLedger existing = ledgerMapper.selectOne(new LambdaQueryWrapper<AiBudgetLedger>()
                .eq(AiBudgetLedger::getRequestId, requestId).last("LIMIT 1"));
        if (existing != null) {
            Reservation reused = new Reservation();
            reused.setRequestId(requestId);
            reused.setLedgerId(existing.getId());
            reused.setNewlyCreated(false);
            return reused;
        }

        int total = Math.max(0, promptTokensEst) + Math.max(0, completionTokensEst);
        BigDecimal reservedCost = computeCost(promptTokensEst, completionTokensEst, 0,
                unitInputPerMillion, unitOutputPerMillion, null);
        boolean hasPrice = unitInputPerMillion != null && unitOutputPerMillion != null;

        AiBudgetLedger row = new AiBudgetLedger();
        row.setRequestId(requestId);
        row.setUsername(username);
        row.setModelKey(modelKey);
        row.setReservationTokens(total);
        row.setReservedCost(reservedCost != null ? reservedCost : BigDecimal.ZERO);
        row.setCurrency(currency == null ? "" : currency);
        row.setStatus(STATUS_RESERVED);
        row.setVerificationStatus(hasPrice ? "ESTIMATED" : "UNKNOWN");
        try {
            ledgerMapper.insert(row);
        } catch (DuplicateKeyException e) {
            AiBudgetLedger other = ledgerMapper.selectOne(new LambdaQueryWrapper<AiBudgetLedger>()
                    .eq(AiBudgetLedger::getRequestId, requestId).last("LIMIT 1"));
            Reservation reused = new Reservation();
            reused.setRequestId(requestId);
            reused.setLedgerId(other != null ? other.getId() : 0L);
            reused.setNewlyCreated(false);
            return reused;
        }

        Reservation out = new Reservation();
        out.setRequestId(requestId);
        out.setLedgerId(row.getId());
        out.setNewlyCreated(true);
        return out;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void settle(String requestId, int actualPrompt, int actualCompletion, int cached,
                       BigDecimal unitIn, BigDecimal unitOut, BigDecimal cachedUnitIn, String currency) {
        if (!StringUtils.hasText(requestId)) return;
        BigDecimal actualCost = computeCost(actualPrompt, actualCompletion, cached, unitIn, unitOut, cachedUnitIn);
        boolean hasPrice = unitIn != null && unitOut != null;
        int affected = ledgerMapper.update(null, new LambdaUpdateWrapper<AiBudgetLedger>()
                .eq(AiBudgetLedger::getRequestId, requestId)
                .eq(AiBudgetLedger::getStatus, STATUS_RESERVED)
                .set(AiBudgetLedger::getStatus, STATUS_SETTLED)
                .set(AiBudgetLedger::getActualTokens, Math.max(0, actualPrompt) + Math.max(0, actualCompletion))
                .set(AiBudgetLedger::getActualCost, actualCost != null ? actualCost : BigDecimal.ZERO)
                .set(AiBudgetLedger::getCurrency, currency == null ? "" : currency)
                .set(AiBudgetLedger::getVerificationStatus, hasPrice ? "VERIFIED" : "UNKNOWN"));
        if (affected == 0) {
            log.info("预算结算未命中 RESERVED 行：{}", requestId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void release(String requestId, String errorMessage) {
        if (!StringUtils.hasText(requestId)) return;
        int affected = ledgerMapper.update(null, new LambdaUpdateWrapper<AiBudgetLedger>()
                .eq(AiBudgetLedger::getRequestId, requestId)
                .eq(AiBudgetLedger::getStatus, STATUS_RESERVED)
                .set(AiBudgetLedger::getStatus, STATUS_RELEASED)
                .set(AiBudgetLedger::getVerificationStatus, "UNKNOWN")
                .set(AiBudgetLedger::getErrorMessage, truncate(errorMessage)));
        if (affected == 0) {
            log.info("预算释放未命中 RESERVED 行：{}", requestId);
        }
    }

    private static BigDecimal computeCost(int prompt, int completion, int cached,
                                          BigDecimal unitIn, BigDecimal unitOut, BigDecimal cachedUnitIn) {
        if (unitIn == null || unitOut == null) return null;
        int p = Math.max(0, prompt);
        int c = Math.max(0, completion);
        int cachedSafe = Math.min(Math.max(0, cached), p);
        int nonCached = p - cachedSafe;
        BigDecimal cachedUnit = cachedUnitIn != null ? cachedUnitIn : unitIn;
        return unitIn.multiply(BigDecimal.valueOf(nonCached))
                .add(cachedUnit.multiply(BigDecimal.valueOf(cachedSafe)))
                .add(unitOut.multiply(BigDecimal.valueOf(c)))
                .divide(MILLION, 6, RoundingMode.HALF_UP);
    }

    private static String truncate(String s) {
        if (s == null) return null;
        return s.length() > 250 ? s.substring(0, 250) : s;
    }
}
