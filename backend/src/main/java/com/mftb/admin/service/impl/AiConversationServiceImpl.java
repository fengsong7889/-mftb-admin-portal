package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.AiConversation;
import com.mftb.admin.entity.SysConfig;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiConversationMapper;
import com.mftb.admin.mapper.SysConfigMapper;
import com.mftb.admin.service.AiConversationService;
import com.mftb.admin.util.BizSeqService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * AI 助手会话服务实现
 * 所有操作基于 JWT 中的 username，只能操作自己的会话
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiConversationServiceImpl implements AiConversationService {

    private final AiConversationMapper conversationMapper;
    private final SysConfigMapper sysConfigMapper;
    private final BizSeqService bizSeqService;

    private static final int DEFAULT_MAX_CONVERSATIONS = 50;

    @Override
    public List<AiConversation> listMyConversations() {
        String username = currentUsername();
        if (username == null) return List.of();
        return conversationMapper.selectList(
                new LambdaQueryWrapper<AiConversation>()
                        .eq(AiConversation::getUsername, username)
                        .orderByDesc(AiConversation::getUpdatedAt));
    }

    @Override
    public AiConversation createConversation() {
        String username = currentUsername();
        if (username == null) throw new IllegalStateException("未登录");

        // 检查是否已达上限
        int max = getMaxConversations();
        long count = conversationMapper.selectCount(
                new LambdaQueryWrapper<AiConversation>()
                        .eq(AiConversation::getUsername, username));
        if (count >= max) {
            // 自动清理最旧的会话
            List<AiConversation> all = conversationMapper.selectList(
                    new LambdaQueryWrapper<AiConversation>()
                            .eq(AiConversation::getUsername, username)
                            .orderByAsc(AiConversation::getUpdatedAt));
            if (!all.isEmpty()) {
                conversationMapper.softDeleteById(all.get(0).getId(), username);
                log.info("自动清理最旧会话 id={} 为用户 {} 腾出空间（移至回收站）", all.get(0).getId(), username);
            }
        }

        AiConversation conv = new AiConversation();
        conv.setUsername(username);
        conv.setTitle("新對話");
        conv.setMessages("[]");
        conv.setConversationId(bizSeqService.next(BizSeqService.RULE_AI_CONVERSATION));
        conversationMapper.insert(conv);
        return conv;
    }

    @Override
    public void updateConversation(Long id, String title, String messages, String modelKey, Integer totalTokens) {
        String username = currentUsername();
        if (username == null) throw new IllegalStateException("未登录");

        AiConversation conv = conversationMapper.selectById(id);
        if (conv == null || !conv.getUsername().equals(username)) {
            throw new IllegalArgumentException("会话不存在或无权操作");
        }

        AiConversation update = new AiConversation();
        update.setId(id);
        if (title != null) update.setTitle(title);
        if (messages != null) update.setMessages(messages);
        if (modelKey != null) update.setModelKey(modelKey);
        if (totalTokens != null) update.setTotalTokens(totalTokens);
        conversationMapper.updateById(update);
    }

    @Override
    public void deleteConversation(Long id) {
        String username = currentUsername();
        if (username == null) throw new IllegalStateException("未登录");

        AiConversation conv = conversationMapper.selectById(id);
        if (conv == null || !conv.getUsername().equals(username)) {
            throw new IllegalArgumentException("会话不存在或无权操作");
        }

        // 至少保留一个活跃会话
        long count = conversationMapper.selectCount(
                new LambdaQueryWrapper<AiConversation>()
                        .eq(AiConversation::getUsername, username));
        if (count <= 1) {
            throw new IllegalStateException("至少保留一個會話");
        }

        // 软删除并记录删除时间戳
        conversationMapper.softDeleteById(id, username);
    }

    @Override
    public List<AiConversation> listDeletedConversations() {
        String username = currentUsername();
        if (username == null) return List.of();
        return conversationMapper.selectDeletedByUsername(username);
    }

    @Override
    public void restoreConversation(Long id) {
        String username = currentUsername();
        if (username == null) throw new IllegalStateException("未登录");

        // 检查活跃会话是否已达上限
        int max = getMaxConversations();
        long activeCount = conversationMapper.selectCount(
                new LambdaQueryWrapper<AiConversation>()
                        .eq(AiConversation::getUsername, username));
        if (activeCount >= max) {
            // 自动归档最旧的活跃会话
            List<AiConversation> oldest = conversationMapper.selectList(
                    new LambdaQueryWrapper<AiConversation>()
                            .eq(AiConversation::getUsername, username)
                            .orderByAsc(AiConversation::getUpdatedAt)
                            .last("LIMIT 1"));
            if (!oldest.isEmpty()) {
                conversationMapper.softDeleteById(oldest.get(0).getId(), username);
                log.info("恢复会话时自动归档最旧活跃会话 id={} 为用户 {}", oldest.get(0).getId(), username);
            }
        }

        int rows = conversationMapper.restoreById(id, username);
        if (rows == 0) {
            throw new IllegalArgumentException("会话不存在或无权操作");
        }
    }

    @Override
    public void permanentDeleteConversation(Long id) {
        String username = currentUsername();
        if (username == null) throw new IllegalStateException("未登录");

        int rows = conversationMapper.permanentDeleteById(id, username);
        if (rows == 0) {
            throw new IllegalArgumentException("会话不存在或无权操作");
        }
    }

    @Override
    public int getMaxConversations() {
        try {
            SysConfig config = sysConfigMapper.selectOne(
                    new LambdaQueryWrapper<SysConfig>()
                            .eq(SysConfig::getConfigKey, "ai_max_conversations"));
            if (config != null) {
                return Integer.parseInt(config.getConfigValue());
            }
        } catch (Exception e) {
            log.warn("读取 ai_max_conversations 配置失败，使用默认值 {}: {}", DEFAULT_MAX_CONVERSATIONS, e.getMessage());
        }
        return DEFAULT_MAX_CONVERSATIONS;
    }

    /** 当前登录用户账号 */
    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getDetails() instanceof SysUser user) {
            return user.getUsername();
        }
        return null;
    }

    /* ── 管理员审计接口实现 ── */

    @Override
    public Page<AiConversation> listAllConversations(int page, int size, String username, String modelKey, String startDate, String endDate) {
        // 使用审计专用 Mapper 方法，绕过 @TableLogic 过滤，包含已软删除的记录
        return conversationMapper.selectPageForAudit(new Page<>(page, size), username, modelKey, startDate, endDate);
    }

    @Override
    public List<String> listDistinctModelKeys() {
        // 使用审计专用 Mapper 方法，绕过 @TableLogic 过滤，包含已软删除记录中的模型
        return conversationMapper.selectModelKeysForAudit();
    }

    @Override
    public List<String> listDistinctUsernames() {
        // 使用审计专用 Mapper 方法，绕过 @TableLogic 过滤，包含已软删除记录中的用户
        return conversationMapper.selectUsernamesForAudit();
    }

    @Override
    public AiConversation getConversationForAudit(Long id) {
        return conversationMapper.selectByIdForAudit(id);
    }

    private LocalDateTime parseStartDateTime(String dateStr) {
        if (dateStr == null) return null;
        return LocalDate.parse(dateStr, DateTimeFormatter.ISO_LOCAL_DATE).atStartOfDay();
    }

    private LocalDateTime parseEndDateTime(String dateStr) {
        if (dateStr == null) return null;
        return LocalDate.parse(dateStr, DateTimeFormatter.ISO_LOCAL_DATE).atTime(LocalTime.MAX);
    }
}
