package com.mftb.admin.service;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.NotificationAppDTO.*;
import com.mftb.admin.util.OperatorResolver;
import jakarta.validation.Validator;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.security.SecureRandom;
import java.time.format.DateTimeFormatter;
import java.util.*;

/** 应用凭据与场景路由分开管理，沿用配置模块 JDBC 存储以避免 MyBatis 结果日志输出密钥。 */
@Service
@RequiredArgsConstructor
public class NotificationAppService {
    public static final String CLAIM_SIGN = "asset_claim_sign";
    private static final String SIGN_SECRET = DingTalkAppService.SIGN_SECRET;
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private final JdbcTemplate jdbc;
    private final OperatorResolver operator;
    private final Validator validator;

    /** 只登记已有触发点的场景；新增业务必须同时接入通知调用，不能由前端任意创建。 */
    private static final Map<String, List<String>> SCENARIOS = Map.of(CLAIM_SIGN,
            List.of("資產領用待簽署", "領用登記或重新發送簽署通知時", "領用人（已綁定釘釘用戶 ID）"));

    public List<View> list(String name, Boolean enabled) {
        List<ScenarioView> scenarios = scenarios();
        boolean signingConfigured = signingConfigured();
        return jdbc.query("SELECT id, name, platform, app_key, agent_id, base_url, enabled, remark, updated_by, updated_at, "
                        + "CASE WHEN TRIM(app_secret) <> '' THEN 1 ELSE 0 END AS secret_configured FROM sys_notification_app "
                        + "WHERE (? IS NULL OR name LIKE ?) AND (? IS NULL OR enabled = ?) ORDER BY updated_at DESC, id DESC",
                (rs, row) -> {
                    long id = rs.getLong("id");
                    return new View(id, rs.getString("name"), rs.getString("platform"), rs.getString("app_key"),
                            rs.getString("agent_id"), rs.getString("base_url"), rs.getBoolean("secret_configured"), signingConfigured,
                            rs.getBoolean("enabled"), rs.getString("remark"), rs.getString("updated_by"),
                            rs.getTimestamp("updated_at").toLocalDateTime().format(DATE_FORMAT),
                            scenarios.stream().filter(s -> Objects.equals(s.appId(), id)).map(ScenarioView::name).toList());
                },
                name, name == null ? null : "%" + name.trim() + "%", enabled, enabled);
    }

    public View detail(long id) {
        return list(null, null).stream().filter(v -> v.id() == id).findFirst()
                .orElseThrow(() -> new BusinessException(404, "企業應用不存在"));
    }

    @Transactional(rollbackFor = Exception.class)
    public long save(Long id, Save request) {
        validate(request);
        String baseUrl = normalizeBaseUrl(request.getBaseUrl());
        Credentials current = id == null ? null : credentials(id, true);
        String secret = request.getAppSecret();
        if (!StringUtils.hasText(secret)) {
            if (current == null || !StringUtils.hasText(current.getAppSecret()) || !current.getAppKey().equals(request.getAppKey())) {
                throw new BusinessException(400, "首次配置或更換 AppKey 時必須填寫 AppSecret");
            }
            secret = current.getAppSecret();
        }
        if (secret.chars().anyMatch(Character::isWhitespace) || secret.contains("*") || secret.contains("•")) {
            throw new BusinessException(400, "請輸入完整 AppSecret，不能包含空白或遮罩字元");
        }
        String updatedBy = operator.currentOperatorName();
        String remark = Objects.toString(request.getRemark(), "").trim();
        try {
            if (id == null) {
                var holder = new GeneratedKeyHolder();
                String finalSecret = secret;
                jdbc.update(connection -> {
                    var statement = connection.prepareStatement("INSERT INTO sys_notification_app "
                            + "(name, app_key, app_secret, agent_id, base_url, remark, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
                            new String[]{"id"});
                    statement.setString(1, request.getName().trim());
                    statement.setString(2, request.getAppKey());
                    statement.setString(3, finalSecret);
                    statement.setString(4, request.getAgentId());
                    statement.setString(5, baseUrl);
                    statement.setString(6, remark);
                    statement.setString(7, updatedBy);
                    return statement;
                }, holder);
                id = Objects.requireNonNull(holder.getKey()).longValue();
            } else {
                jdbc.update("UPDATE sys_notification_app SET name=?, app_key=?, app_secret=?, agent_id=?, base_url=?, "
                                + "remark=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                        request.getName().trim(), request.getAppKey(), secret, request.getAgentId(), baseUrl, remark, updatedBy, id);
            }
        } catch (DuplicateKeyException e) {
            // 不回传数据库异常；异常中可能包含正在保存的凭据。
            throw new BusinessException(400, "該 AppKey 已配置，請直接綁定已有應用");
        }
        ensureSigningSecret();
        return id;
    }

    @Transactional(rollbackFor = Exception.class)
    public void toggle(long id, boolean enabled) {
        Credentials app = credentials(id, true);
        if (enabled) requireComplete(app);
        jdbc.update("UPDATE sys_notification_app SET enabled=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                enabled, operator.currentOperatorName(), id);
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        credentials(id, true);
        // 包含停用规则，防止删除后留下悬空绑定。外键同时兜底并发绑定。
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM sys_notification_scenario WHERE app_id=?", Integer.class, id);
        if (count != null && count > 0) throw new BusinessException(400, "應用仍綁定通知場景，請先解除或更換綁定");
        jdbc.update("DELETE FROM sys_notification_app WHERE id=?", id);
    }

    public List<ScenarioView> scenarios() {
        return jdbc.query("SELECT s.*, a.name AS app_name, a.enabled AS app_enabled FROM sys_notification_scenario s "
                        + "LEFT JOIN sys_notification_app a ON a.id=s.app_id ORDER BY s.scenario_key",
                (rs, row) -> {
                    String key = rs.getString("scenario_key");
                    List<String> definition = SCENARIOS.get(key);
                    if (definition == null) return null;
                    return new ScenarioView(key, definition.get(0), definition.get(1), definition.get(2),
                            rs.getObject("app_id", Long.class), rs.getString("app_name"), rs.getBoolean("enabled"),
                            rs.getBoolean("app_enabled"), rs.getString("updated_by"),
                            rs.getTimestamp("updated_at").toLocalDateTime().format(DATE_FORMAT));
                }).stream().filter(Objects::nonNull).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveScenario(String key, ScenarioSave request) {
        validate(request);
        if (!SCENARIOS.containsKey(key)) throw new BusinessException(400, "該場景尚未接入業務通知");
        // 应用行先锁定，与删除、启停保持一致，避免绑定检查与写入间的竞态。
        Credentials app = request.appId() == null ? null : credentials(request.appId(), true);
        if (request.enabled()) {
            if (app == null || !app.isEnabled()) throw new BusinessException(400, "請先選擇已啟用的企業應用");
            requireComplete(app);
        }
        int changed = jdbc.update("UPDATE sys_notification_scenario SET app_id=?, enabled=?, updated_by=?, "
                        + "updated_at=CURRENT_TIMESTAMP WHERE scenario_key=?", request.appId(), request.enabled(),
                operator.currentOperatorName(), key);
        if (changed == 0) throw new BusinessException(404, "通知場景不存在");
    }

    /** 无默认回退：停用、未绑定的场景必须真正停止发送。 */
    public Credentials resolve(String key) {
        if (!SCENARIOS.containsKey(key)) return null;
        List<Long> ids = jdbc.queryForList("SELECT s.app_id FROM sys_notification_scenario s JOIN sys_notification_app a ON a.id=s.app_id "
                + "WHERE s.scenario_key=? AND s.enabled=1 AND a.enabled=1", Long.class, key);
        if (ids.isEmpty()) return null;
        Credentials app = credentials(ids.get(0), false);
        return app.isEnabled() ? app : null;
    }

    public Credentials credentials(long id, boolean lock) {
        List<Credentials> values = jdbc.query("SELECT id, app_key, app_secret, agent_id, base_url, enabled FROM sys_notification_app WHERE id=?"
                        + (lock ? " FOR UPDATE" : ""), (rs, row) -> new Credentials(rs.getLong("id"), rs.getString("app_key"),
                        rs.getString("app_secret"), rs.getString("agent_id"), rs.getString("base_url"), rs.getBoolean("enabled")), id);
        if (values.isEmpty()) throw new BusinessException(404, "企業應用不存在");
        return values.get(0);
    }

    public void requireComplete(Credentials app) {
        if (!StringUtils.hasText(app.getAppKey()) || !StringUtils.hasText(app.getAppSecret())) {
            throw new BusinessException(400, "請先保存完整的企業應用憑證");
        }
        try {
            if (Long.parseLong(app.getAgentId()) <= 0) throw new NumberFormatException();
        } catch (NumberFormatException e) { throw new BusinessException(400, "AgentId 超出有效正整數範圍"); }
        normalizeBaseUrl(app.getBaseUrl());
    }

    private void validate(Object request) {
        var violations = validator.validate(request);
        if (!violations.isEmpty()) throw new BusinessException(400, violations.iterator().next().getMessage());
        if (request instanceof Save save) {
            try { if (Long.parseLong(save.getAgentId()) <= 0) throw new NumberFormatException(); }
            catch (NumberFormatException e) { throw new BusinessException(400, "AgentId 超出有效正整數範圍"); }
        }
    }

    private String normalizeBaseUrl(String value) {
        String normalized = Objects.toString(value, "").trim();
        try {
            URI uri = URI.create(normalized);
            if (!("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || uri.getPort() == 0 || uri.getPort() > 65535) throw new IllegalArgumentException();
        } catch (IllegalArgumentException e) {
            throw new BusinessException(400, "請填寫有效的 HTTP(S) 站點地址，不含帳密、查詢參數或 # 路由");
        }
        while (normalized.endsWith("/")) normalized = normalized.substring(0, normalized.length() - 1);
        return normalized;
    }

    private boolean signingConfigured() {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT COUNT(*) > 0 FROM sys_config WHERE config_key=? AND TRIM(config_value) <> ''",
                Boolean.class, SIGN_SECRET));
    }

    private void ensureSigningSecret() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        // 签署密钥属于业务签署能力，不随应用切换、停用或删除而轮换。
        jdbc.update("INSERT INTO sys_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = "
                        + "CASE WHEN config_value IS NULL OR TRIM(config_value)='' THEN VALUES(config_value) ELSE config_value END",
                SIGN_SECRET, Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
    }

    /** 内部传输快照，不生成含密钥的 toString；即使被误序列化也不输出凭据。 */
    @Getter
    @RequiredArgsConstructor
    public static final class Credentials {
        private final long id;
        private final String appKey;
        @JsonIgnore private final String appSecret;
        private final String agentId;
        private final String baseUrl;
        private final boolean enabled;
    }
}
