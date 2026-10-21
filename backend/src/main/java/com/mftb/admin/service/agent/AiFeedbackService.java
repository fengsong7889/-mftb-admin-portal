package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiFeedback;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiFeedbackMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 回答反馈：赞/踩 + 原因，按 (user_id, message_id) 唯一，重复提交只更新。
 *
 * <p>反馈是配置中心迭代的依据：低分回答可按工具/领域聚合，反推是能力描述、
 * 术语口径还是回答骨架需要调整。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiFeedbackService {

    private final AiFeedbackMapper feedbackMapper;
    private final OperatorResolver operatorResolver;

    @Transactional(rollbackFor = Exception.class)
    public AiFeedback submit(AiFeedback input) {
        SysUser user = operatorResolver.currentUser();
        if (user == null) throw new BusinessException("登錄狀態已失效，請重新登錄");
        if (input == null || !StringUtils.hasText(input.getMessageId())) {
            throw new BusinessException("缺少消息標識");
        }
        Integer rating = input.getRating();
        if (rating == null || (rating != 1 && rating != -1)) {
            throw new BusinessException("評分只能為贊(1)或踩(-1)");
        }
        AiFeedback existing = feedbackMapper.selectOne(new LambdaQueryWrapper<AiFeedback>()
                .eq(AiFeedback::getUserId, user.getId())
                .eq(AiFeedback::getMessageId, input.getMessageId())
                .last("LIMIT 1"));
        if (existing == null) {
            input.setUserId(user.getId());
            input.setReason(truncate(input.getReason(), 64));
            input.setAnswerPreview(truncate(input.getAnswerPreview(), 500));
            input.setToolKeys(truncate(input.getToolKeys(), 500));
            feedbackMapper.insert(input);
            return input;
        }
        existing.setRating(rating);
        existing.setReason(truncate(input.getReason(), 64));
        existing.setAnswerPreview(truncate(input.getAnswerPreview(), 500));
        existing.setToolKeys(truncate(input.getToolKeys(), 500));
        if (input.getConversationPk() != null) existing.setConversationPk(input.getConversationPk());
        feedbackMapper.updateById(existing);
        return existing;
    }

    /** 管理员低分看板：按评分筛选，最近优先。 */
    public List<AiFeedback> recent(Integer rating, int limit) {
        int cap = Math.min(Math.max(limit, 1), 200);
        LambdaQueryWrapper<AiFeedback> wrapper = new LambdaQueryWrapper<AiFeedback>()
                .orderByDesc(AiFeedback::getCreatedAt)
                .last("LIMIT " + cap);
        if (rating != null) wrapper.eq(AiFeedback::getRating, rating);
        return feedbackMapper.selectList(wrapper);
    }

    /**
     * 低分聚合：按工具与原因统计，给配置中心提供“改哪里”的依据。
     * <p>只拉最近 5000 条在内存聚合：反馈量级远小于此，避免为看板新增专用 SQL 表/作业。
     */
    public Map<String, Object> stats(int days) {
        int window = Math.min(Math.max(days, 1), 365);
        List<AiFeedback> rows = feedbackMapper.selectList(new LambdaQueryWrapper<AiFeedback>()
                .ge(AiFeedback::getCreatedAt, java.time.LocalDateTime.now().minusDays(window))
                .orderByDesc(AiFeedback::getCreatedAt)
                .last("LIMIT 5000"));
        long up = 0;
        long down = 0;
        Map<String, Integer> byTool = new LinkedHashMap<>();
        Map<String, Integer> byReason = new LinkedHashMap<>();
        Map<String, long[]> daily = new LinkedHashMap<>();
        for (AiFeedback row : rows) {
            boolean good = row.getRating() != null && row.getRating() == 1;
            if (good) up++; else down++;
            if (!good && row.getToolKeys() != null) {
                for (String key : row.getToolKeys().split(",")) {
                    String tool = key.trim();
                    if (!tool.isEmpty()) byTool.merge(tool, 1, Integer::sum);
                }
            }
            if (!good && row.getReason() != null && !row.getReason().isBlank()) {
                byReason.merge(row.getReason().trim(), 1, Integer::sum);
            }
            String date = row.getCreatedAt() == null ? "—" : row.getCreatedAt().toLocalDate().toString();
            long[] bucket = daily.computeIfAbsent(date, k -> new long[2]);
            if (good) bucket[0]++; else bucket[1]++;
        }
        List<Map<String, Object>> tools = new ArrayList<>();
        byTool.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                .limit(10)
                .forEach(e -> tools.add(Map.of("toolKey", e.getKey(), "count", e.getValue())));
        List<Map<String, Object>> reasons = new ArrayList<>();
        byReason.entrySet().stream()
                .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                .limit(10)
                .forEach(e -> reasons.add(Map.of("reason", e.getKey(), "count", e.getValue())));
        List<Map<String, Object>> trend = new ArrayList<>();
        daily.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(e -> trend.add(Map.of("date", e.getKey(),
                        "up", e.getValue()[0], "down", e.getValue()[1])));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", window);
        out.put("total", up + down);
        out.put("up", up);
        out.put("down", down);
        out.put("downRate", (up + down) == 0 ? 0d : Math.round(down * 1000d / (up + down)) / 10d);
        out.put("byTool", tools);
        out.put("topReasons", reasons);
        out.put("daily", trend);
        return out;
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        String one = s.replaceAll("\\s+", " ").trim();
        return one.length() <= max ? one : one.substring(0, max) + "…";
    }
}
