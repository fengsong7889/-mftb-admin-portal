package com.mftb.admin.service.agent.platform;

import com.mftb.admin.common.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * WP05：预算池原子准入。{@code 已结算 + 已预占 + 本次估算 ≤ 上限} 由单条条件 UPDATE 完成，
 * 并发下只有一个请求能占用最后一个名额。
 *
 * <p>未配置预算池的组织/个人沿用既有额度策略（{@code ai_*quota*}），此处不代为其判定；
 * 一旦为该 scope 配置了池，池就是硬上限。金额一律 DECIMAL，禁止浮点。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiBudgetPoolService {

    /** 预算池拒绝：调用方必须转成“超额”而不是静默继续。 */
    public static class BudgetDeniedException extends RuntimeException {
        public BudgetDeniedException(String message) { super(message); }
    }

    private final JdbcTemplate jdbc;

    public static String currentPeriod() {
        return java.time.LocalDate.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM"));
    }

    /** 原子预占；返回 false 表示池已满或已停用。无池行时返回 true（交给既有额度策略）。 */
    @Transactional(propagation = Propagation.REQUIRED, rollbackFor = Exception.class)
    public boolean tryReserve(String scopeType, String scopeKey, String period, String currency, BigDecimal amount) {
        if (!StringUtils.hasText(scopeKey) || amount == null || amount.signum() <= 0) return true;
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, limit_amount, reserved_amount, used_amount FROM ai_budget_pool "
                        + "WHERE scope_type=? AND scope_key=? AND period=? AND currency=? AND status=1",
                scopeType, scopeKey, period == null ? currentPeriod() : period, currency == null ? "CNY" : currency);
        if (rows.isEmpty()) return true;
        Map<String, Object> row = rows.get(0);
        int updated = jdbc.update(
                "UPDATE ai_budget_pool SET reserved_amount = reserved_amount + ? "
                        + "WHERE id=? AND status=1 AND used_amount + reserved_amount + ? <= limit_amount",
                amount, ((Number) row.get("id")).longValue(), amount);
        if (updated == 0) {
            log.info("[BudgetPool] 拒绝预占 scope={}:{} period={} amount={}", scopeType, scopeKey, period, amount);
            return false;
        }
        return true;
    }

    /** 结算：预占转已用，实际费用可能低于或高于估算；超出部分同样落账（真实消耗不能丢）。 */
    @Transactional(rollbackFor = Exception.class)
    public void settle(String scopeType, String scopeKey, String period, String currency,
                       BigDecimal reserved, BigDecimal actual) {
        if (!StringUtils.hasText(scopeKey)) return;
        BigDecimal release = reserved == null ? BigDecimal.ZERO : reserved;
        BigDecimal use = actual == null ? BigDecimal.ZERO : actual;
        jdbc.update("UPDATE ai_budget_pool SET "
                        + "reserved_amount = GREATEST(reserved_amount - ?, 0), "
                        + "used_amount = used_amount + ? "
                        + "WHERE scope_type=? AND scope_key=? AND period=? AND currency=?",
                release, use, scopeType, scopeKey, period == null ? currentPeriod() : period,
                currency == null ? "CNY" : currency);
    }

    @Transactional(rollbackFor = Exception.class)
    public void release(String scopeType, String scopeKey, String period, String currency, BigDecimal reserved) {
        if (!StringUtils.hasText(scopeKey) || reserved == null || reserved.signum() <= 0) return;
        jdbc.update("UPDATE ai_budget_pool SET reserved_amount = GREATEST(reserved_amount - ?, 0) "
                        + "WHERE scope_type=? AND scope_key=? AND period=? AND currency=?",
                reserved, scopeType, scopeKey, period == null ? currentPeriod() : period,
                currency == null ? "CNY" : currency);
    }

    public List<Map<String, Object>> list(String scopeType) {
        String sql = "SELECT id, scope_type, scope_key, period, currency, limit_amount, reserved_amount, used_amount, status, updated_at "
                + "FROM ai_budget_pool";
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(scopeType)) {
            sql += " WHERE scope_type=?";
            args.add(scopeType);
        }
        sql += " ORDER BY updated_at DESC LIMIT 200";
        return jdbc.queryForList(sql, args.toArray());
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> save(Map<String, Object> body, String operator) {
        String scopeType = text(body.get("scopeType"), "USER");
        String scopeKey = text(body.get("scopeKey"), null);
        String period = text(body.get("period"), currentPeriod());
        String currency = text(body.get("currency"), "CNY");
        if (!List.of("USER", "DEPT", "APP").contains(scopeType)) throw new BusinessException("不支持的預算範圍類型");
        if (!StringUtils.hasText(scopeKey) || scopeKey.length() > 64) throw new BusinessException("請填寫預算範圍標識");
        if (!period.matches("\\d{4}-\\d{2}|ALL")) throw new BusinessException("期間格式應為 YYYY-MM 或 ALL");
        BigDecimal limit;
        try {
            limit = new BigDecimal(String.valueOf(body.get("limitAmount")));
        } catch (RuntimeException e) {
            throw new BusinessException("請填寫合法的預算上限");
        }
        if (limit.signum() < 0 || limit.scale() > 6) throw new BusinessException("預算上限不能為負，最多 6 位小數");
        jdbc.update("INSERT INTO ai_budget_pool(scope_type, scope_key, period, currency, limit_amount, created_by) "
                        + "VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE limit_amount=VALUES(limit_amount), status=1",
                scopeType, scopeKey, period, currency, limit, operator);
        return jdbc.queryForMap("SELECT * FROM ai_budget_pool WHERE scope_type=? AND scope_key=? AND period=? AND currency=?",
                scopeType, scopeKey, period, currency);
    }

    private static String text(Object value, String fallback) {
        String s = value == null ? null : String.valueOf(value).trim();
        return StringUtils.hasText(s) ? s : fallback;
    }
}
