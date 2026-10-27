package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiUserMemory;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiUserMemoryMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI 助手长期记忆：用户显式保存、可查看/编辑/停用/删除，按用户隔离。
 *
 * <p>为什么先做“显式记忆”而不自动抽取：错误或过期的记忆会长期污染回答，
 * 且隐私风险高；用户主动点“記住這條”并确认内容，收益/风险比最好。
 *
 * <p>注入策略：按当前问题做相关记忆检索（全文/关键词降级），无命中时回退最近 10 条；
 * 每条 ≤120 字，单独一节“用戶偏好（僅供參考，不得覆蓋安全規則）”，不参与权限判断。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiUserMemoryService {

    private static final int MAX_CONTENT = 500;
    /** 默认值；运营可在「記憶策略」页调整（范围由 AiRuntimeSettingService 校验） */
    private static final int DEFAULT_MAX_ENTRIES = 50;
    private static final int DEFAULT_PROMPT_LIMIT = 10;
    private static final int PROMPT_ITEM_CHARS = 120;
    private static final int DEFAULT_RETENTION_DAYS = 180;

    /** 手机、邮箱、证件、银行卡、密码/密钥关键词；命中即拒绝写入 */
    private static final Pattern SENSITIVE = Pattern.compile(
            "(?i)(password|passwd|pwd|token|secret|api[_\\s-]?key|密碼|密码|口令)"
                    + "|(1[3-9]\\d{9})"
                    + "|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})"
                    + "|(\\b\\d{16,19}\\b)"
                    + "|(\\b\\d{17}[\\dXx]\\b)");

    /** 自动记忆候选：只在用户明确表达“以后都/记住/我负责”时提取，仍需用户点确认才落库 */
    private static final Pattern SUGGEST = Pattern.compile(
            "(?:記住|记住|請記住|请记住|以後都|以后都|往後都|我的偏好是|我偏好|我的習慣是|我的习惯是|我負責|我负责)[：:，,\\s]*(.{2,200})");

    private final AiUserMemoryMapper memoryMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;
    private final AiRuntimeSettingService settingService;

    public List<AiUserMemory> listMine() {
        SysUser user = requireUser();
        LocalDateTime now = LocalDateTime.now();
        return memoryMapper.selectList(new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getUserId, user.getId())
                .in(AiUserMemory::getStatus, List.of("active", "disabled"))
                .and(w -> w.isNull(AiUserMemory::getExpiresAt).or().gt(AiUserMemory::getExpiresAt, now))
                .orderByDesc(AiUserMemory::getUpdatedAt));
    }

    @Transactional(rollbackFor = Exception.class)
    public AiUserMemory create(AiUserMemory input) {
        SysUser user = requireUser();
        String content = normalize(input == null ? null : input.getContent());
        checkSensitive(content);
        String hash = sha256(content);
        AiUserMemory existing = memoryMapper.selectOne(new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getUserId, user.getId())
                .eq(AiUserMemory::getContentHash, hash)
                .last("LIMIT 1"));
        if (existing != null) {
            if ("active".equals(existing.getStatus())) {
                throw new BusinessException("這條記憶已存在");
            }
            existing.setStatus("active");
            existing.setExpiresAt(LocalDateTime.now().plusDays(retentionDays()));
            memoryMapper.updateById(existing);
            return existing;
        }
        Long count = memoryMapper.selectCount(new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getUserId, user.getId()));
        int maxEntries = maxEntries();
        if (count != null && count >= maxEntries) {
            throw new BusinessException("記憶條數已達上限（" + maxEntries + "  條），請先刪除部分記憶");
        }
        AiUserMemory row = new AiUserMemory();
        row.setUserId(user.getId());
        row.setMemoryType(StringUtils.hasText(input.getMemoryType()) ? input.getMemoryType() : "preference");
        row.setContent(content);
        row.setContentHash(hash);
        row.setSource("explicit");
        row.setStatus("active");
        row.setExpiresAt(LocalDateTime.now().plusDays(retentionDays()));
        memoryMapper.insert(row);
        return row;
    }

    @Transactional(rollbackFor = Exception.class)
    public AiUserMemory update(Long id, AiUserMemory input) {
        SysUser user = requireUser();
        AiUserMemory row = requireOwned(id, user);
        if (input != null && input.getContent() != null) {
            String content = normalize(input.getContent());
            checkSensitive(content);
            String hash = sha256(content);
            AiUserMemory conflict = memoryMapper.selectOne(new LambdaQueryWrapper<AiUserMemory>()
                    .eq(AiUserMemory::getUserId, user.getId())
                    .eq(AiUserMemory::getContentHash, hash)
                    .ne(AiUserMemory::getId, id)
                    .last("LIMIT 1"));
            if (conflict != null) throw new BusinessException("這條記憶已存在");
            row.setContent(content);
            row.setContentHash(hash);
        }
        if (input != null && StringUtils.hasText(input.getStatus())) {
            if (!List.of("active", "disabled").contains(input.getStatus())) {
                throw new BusinessException("不支持的記憶狀態");
            }
            row.setStatus(input.getStatus());
        }
        if (input != null && StringUtils.hasText(input.getMemoryType())) {
            row.setMemoryType(input.getMemoryType());
        }
        memoryMapper.updateById(row);
        return row;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        SysUser user = requireUser();
        requireOwned(id, user);
        memoryMapper.deleteById(id);
    }

    /** 注入 Prompt 的偏好段落；无记忆返回 null。 */
    public String promptSection() {
        return promptSection(null);
    }

    /**
     * 按当前问题检索相关记忆；query 为空时回退最近 10 条。
     * <p>先走 MySQL FULLTEXT（迁移探测创建，ngram 不可用时降级 LIKE）；
     * 两条路径都只取 active + 未过期，避免过期记忆影响回答。
     */
    public String promptSection(String query) {
        SysUser user = operatorResolver.currentUser();
        if (user == null) return null;
        List<String> contents = StringUtils.hasText(query)
                ? relevantContents(user.getId(), query)
                : latestContents(user.getId());
        if (contents.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (String content : contents) {
            if (!StringUtils.hasText(content)) continue;
            if (content.length() > PROMPT_ITEM_CHARS) {
                content = content.substring(0, PROMPT_ITEM_CHARS) + "…";
            }
            sb.append("- ").append(content).append('\n');
        }
        return sb.length() == 0 ? null : sb.toString().trim();
    }

    /** 记忆体量：配置页用于判断是否需要收紧上限/清理；只做聚合，不返回任何记忆正文。 */
    public Map<String, Object> stats() {
        LocalDateTime now = LocalDateTime.now();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", nullSafe(memoryMapper.selectCount(null)));
        out.put("active", nullSafe(memoryMapper.selectCount(new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getStatus, "active")
                .and(w -> w.isNull(AiUserMemory::getExpiresAt).or().gt(AiUserMemory::getExpiresAt, now)))));
        out.put("disabled", nullSafe(memoryMapper.selectCount(new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getStatus, "disabled"))));
        out.put("expired", nullSafe(memoryMapper.selectCount(new LambdaQueryWrapper<AiUserMemory>()
                .isNotNull(AiUserMemory::getExpiresAt).le(AiUserMemory::getExpiresAt, now))));
        out.put("expiring7d", nullSafe(memoryMapper.selectCount(new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getStatus, "active")
                .isNotNull(AiUserMemory::getExpiresAt)
                .gt(AiUserMemory::getExpiresAt, now)
                .le(AiUserMemory::getExpiresAt, now.plusDays(7)))));
        try {
            Long users = jdbcTemplate.queryForObject(
                    "SELECT COUNT(DISTINCT user_id) FROM ai_user_memory", Long.class);
            out.put("users", users == null ? 0 : users);
        } catch (Exception e) {
            log.warn("[AiUserMemory] 统计用户数失败: {}", e.getMessage());
            out.put("users", 0);
        }
        return out;
    }

    private static long nullSafe(Long value) {
        return value == null ? 0 : value;
    }

    private int maxEntries() {
        return settingService.getInt(AiRuntimeSettingService.MEMORY_MAX_COUNT, DEFAULT_MAX_ENTRIES);
    }

    private int promptLimit() {
        return settingService.getInt(AiRuntimeSettingService.MEMORY_PROMPT_TOP, DEFAULT_PROMPT_LIMIT);
    }

    private int retentionDays() {
        return settingService.getInt(AiRuntimeSettingService.MEMORY_RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
    }

    private List<String> latestContents(Long userId) {
        List<AiUserMemory> rows = memoryMapper.selectList(baseWrapper(userId)
                .orderByDesc(AiUserMemory::getUpdatedAt)
                .last("LIMIT " + promptLimit()));
        return rows.stream().map(AiUserMemory::getContent).toList();
    }

    private List<String> relevantContents(Long userId, String query) {
        String q = query.trim();
        if (q.length() > 120) q = q.substring(0, 120);
        List<String> fullText = fullTextSearch(userId, q);
        if (fullText != null && !fullText.isEmpty()) return fullText;
        try {
            List<String> like = likeSearch(userId, q);
            if (like != null && !like.isEmpty()) return like;
        } catch (Exception e) {
            log.debug("[AiUserMemory] LIKE 检索失败，回退最近记忆: {}", e.getMessage());
        }
        return latestContents(userId);
    }

    private List<String> fullTextSearch(Long userId, String query) {
        try {
            String sql = "SELECT content FROM ai_user_memory "
                    + "WHERE user_id = ? AND status = 'active' "
                    + "AND (expires_at IS NULL OR expires_at > ?) "
                    + "AND MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE) > 0 "
                    + "ORDER BY MATCH(content) AGAINST (? IN NATURAL LANGUAGE MODE) DESC "
                    + "LIMIT " + promptLimit();
            return jdbcTemplate.query(sql,
                    (rs, i) -> rs.getString(1), userId, LocalDateTime.now(), query, query);
        } catch (Exception e) {
            log.debug("[AiUserMemory] FULLTEXT 不可用，回退 LIKE: {}", e.getMessage());
            return List.of();
        }
    }

    private List<String> likeSearch(Long userId, String query) {
        List<String> tokens = tokens(query);
        if (tokens.isEmpty()) return List.of();
        StringBuilder where = new StringBuilder();
        List<Object> args = new ArrayList<>();
        args.add(userId);
        args.add(LocalDateTime.now());
        for (int i = 0; i < tokens.size(); i++) {
            if (i > 0) where.append(" OR ");
            where.append("content LIKE ?");
            args.add("%" + tokens.get(i) + "%");
        }
        String sql = "SELECT content FROM ai_user_memory "
                + "WHERE user_id = ? AND status = 'active' "
                + "AND (expires_at IS NULL OR expires_at > ?) "
                + "AND (" + where + ") "
                + "ORDER BY updated_at DESC LIMIT " + promptLimit();
        return jdbcTemplate.query(sql, (rs, i) -> rs.getString(1), args.toArray());
    }

    private static List<String> tokens(String query) {
        Set<String> out = new LinkedHashSet<>();
        for (String part : query.split("[\\s,，。？?！!、；;：:（）()\\[\\]【】\"'“”]+")) {
            String token = part.trim();
            if (token.length() >= 2) out.add(token);
            if (out.size() >= 5) break;
        }
        return new ArrayList<>(out);
    }

    private static LambdaQueryWrapper<AiUserMemory> baseWrapper(Long userId) {
        return new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getUserId, userId)
                .eq(AiUserMemory::getStatus, "active")
                .and(w -> w.isNull(AiUserMemory::getExpiresAt)
                        .or().gt(AiUserMemory::getExpiresAt, LocalDateTime.now()));
    }

    /**
     * 从用户消息中识别可保存的长期偏好（规则式，不调模型）。
     * <p>只做“候选”展示，不自动落库：错误记忆会长期污染回答，必须由用户确认。
     */
    public String suggestFromMessage(String text) {
        if (!settingService.getBool(AiRuntimeSettingService.MEMORY_AUTO_SUGGEST, true)) return null;
        if (!StringUtils.hasText(text)) return null;
        Matcher matcher = SUGGEST.matcher(text);
        if (!matcher.find()) return null;
        String candidate;
        try {
            candidate = normalize(matcher.group(1));
        } catch (BusinessException e) {
            return null;
        }
        if (candidate.length() < 2 || SENSITIVE.matcher(candidate).find()) return null;
        return candidate.length() > 200 ? candidate.substring(0, 200) : candidate;
    }

    private AiUserMemory requireOwned(Long id, SysUser user) {
        AiUserMemory row = id == null ? null : memoryMapper.selectById(id);
        if (row == null || !user.getId().equals(row.getUserId())) {
            throw new BusinessException("記憶不存在或無權操作");
        }
        return row;
    }

    private SysUser requireUser() {
        SysUser user = operatorResolver.currentUser();
        if (user == null) throw new BusinessException("登錄狀態已失效，請重新登錄");
        return user;
    }

    private static String normalize(String raw) {
        if (!StringUtils.hasText(raw)) throw new BusinessException("記憶內容不能為空");
        String content = raw.replaceAll("\\s+", " ").trim();
        if (content.length() > MAX_CONTENT) {
            throw new BusinessException("記憶內容最多 " + MAX_CONTENT + " 字");
        }
        return content;
    }

    private static void checkSensitive(String content) {
        if (SENSITIVE.matcher(content).find()) {
            throw new BusinessException("記憶內容包含敏感信息（手機/郵箱/證件/銀行卡/密碼），請刪除後再保存");
        }
    }

    private static String sha256(String content) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(content.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new BusinessException("記憶內容校驗失敗");
        }
    }
}
