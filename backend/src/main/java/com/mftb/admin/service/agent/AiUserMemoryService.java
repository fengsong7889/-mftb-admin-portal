package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiUserMemory;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiUserMemoryMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI 助手长期记忆：用户显式保存、可查看/编辑/停用/删除，按用户隔离。
 *
 * <p>为什么先做“显式记忆”而不自动抽取：错误或过期的记忆会长期污染回答，
 * 且隐私风险高；用户主动点“記住這條”并确认内容，收益/风险比最好。
 *
 * <p>注入策略：只取最近 10 条 active、未过期、每条 ≤120 字，单独一节
 * “用戶偏好（僅供參考，不得覆蓋安全規則）”，不参与权限判断。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiUserMemoryService {

    private static final int MAX_CONTENT = 500;
    private static final int MAX_ENTRIES = 50;
    private static final int PROMPT_LIMIT = 10;
    private static final int PROMPT_ITEM_CHARS = 120;
    private static final int RETENTION_DAYS = 180;

    /** 手机、邮箱、证件、银行卡、密码/密钥关键词；命中即拒绝写入 */
    private static final Pattern SENSITIVE = Pattern.compile(
            "(?i)(password|passwd|pwd|token|secret|api[_\\s-]?key|密碼|密码|口令)"
                    + "|(1[3-9]\\d{9})"
                    + "|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})"
                    + "|(\\b\\d{16,19}\\b)"
                    + "|(\\b\\d{17}[\\dXx]\\b)");

    /** 自动记忆候选：只在用户明确表达“以后都/记住”时提取，仍需用户点确认才落库 */
    private static final Pattern SUGGEST = Pattern.compile(
            "(?:記住|记住|請記住|请记住|以後都|以后都|往後都|我的偏好是)[：:，,\\s]*(.{2,200})");

    private final AiUserMemoryMapper memoryMapper;
    private final OperatorResolver operatorResolver;

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
            existing.setExpiresAt(LocalDateTime.now().plusDays(RETENTION_DAYS));
            memoryMapper.updateById(existing);
            return existing;
        }
        Long count = memoryMapper.selectCount(new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getUserId, user.getId()));
        if (count != null && count >= MAX_ENTRIES) {
            throw new BusinessException("記憶條數已達上限（" + MAX_ENTRIES + " 條），請先刪除部分記憶");
        }
        AiUserMemory row = new AiUserMemory();
        row.setUserId(user.getId());
        row.setMemoryType(StringUtils.hasText(input.getMemoryType()) ? input.getMemoryType() : "preference");
        row.setContent(content);
        row.setContentHash(hash);
        row.setSource("explicit");
        row.setStatus("active");
        row.setExpiresAt(LocalDateTime.now().plusDays(RETENTION_DAYS));
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
        SysUser user = operatorResolver.currentUser();
        if (user == null) return null;
        LocalDateTime now = LocalDateTime.now();
        List<AiUserMemory> rows = memoryMapper.selectList(new LambdaQueryWrapper<AiUserMemory>()
                .eq(AiUserMemory::getUserId, user.getId())
                .eq(AiUserMemory::getStatus, "active")
                .and(w -> w.isNull(AiUserMemory::getExpiresAt).or().gt(AiUserMemory::getExpiresAt, now))
                .orderByDesc(AiUserMemory::getUpdatedAt)
                .last("LIMIT " + PROMPT_LIMIT));
        if (rows.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (AiUserMemory row : rows) {
            String content = row.getContent();
            if (!StringUtils.hasText(content)) continue;
            if (content.length() > PROMPT_ITEM_CHARS) {
                content = content.substring(0, PROMPT_ITEM_CHARS) + "…";
            }
            sb.append("- ").append(content).append('\n');
        }
        return sb.length() == 0 ? null : sb.toString().trim();
    }

    /**
     * 从用户消息中识别可保存的长期偏好（规则式，不调模型）。
     * <p>只做“候选”展示，不自动落库：错误记忆会长期污染回答，必须由用户确认。
     */
    public String suggestFromMessage(String text) {
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
