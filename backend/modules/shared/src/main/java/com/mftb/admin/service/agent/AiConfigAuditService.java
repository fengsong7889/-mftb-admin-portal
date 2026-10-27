package com.mftb.admin.service.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.entity.AiConfigChangeLog;
import com.mftb.admin.mapper.AiConfigChangeLogMapper;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * AI 配置变更审计：能力/骨架/术语/知识库/护栏统一写入口。
 *
 * <p>before/after 只保留 4000 字：知识库正文可能 6 万字，整段写审计会撑爆 TEXT 并把
 * 审计表变成第二份业务数据；完整内容仍以业务表为准。
 * <p>审计失败只记 warn，不阻断业务保存（审计不能反过来把保存打挂）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiConfigAuditService {

    private static final int MAX_JSON_CHARS = 4000;
    private static final int MAX_PAGE_SIZE = 100;

    private final AiConfigChangeLogMapper changeLogMapper;
    private final OperatorResolver operatorResolver;
    private final ObjectMapper objectMapper;

    public void record(String type, String key, String action, Object before, Object after) {
        try {
            AiConfigChangeLog row = new AiConfigChangeLog();
            row.setConfigType(type);
            row.setConfigKey(truncate(key, 128));
            row.setAction(action);
            row.setBeforeJson(truncate(toJson(before), MAX_JSON_CHARS));
            row.setAfterJson(truncate(toJson(after), MAX_JSON_CHARS));
            row.setOperator(operatorResolver.currentOperatorName());
            changeLogMapper.insert(row);
        } catch (Exception e) {
            log.warn("[AiConfigAudit] 审计写入失败 type={} key={}: {}", type, key, e.getMessage());
        }
    }

    /** 分页查询：支持类型/动作/操作人/对象关键字/时间范围；默认按时间倒序。 */
    public Map<String, Object> page(String configType, String action, String operator,
                                    String keyword, LocalDateTime from, LocalDateTime to,
                                    int page, int size) {
        int p = Math.max(page, 1);
        int s = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        LambdaQueryWrapper<AiConfigChangeLog> wrapper = new LambdaQueryWrapper<AiConfigChangeLog>()
                .orderByDesc(AiConfigChangeLog::getId);
        if (StringUtils.hasText(configType)) wrapper.eq(AiConfigChangeLog::getConfigType, configType);
        if (StringUtils.hasText(action)) wrapper.eq(AiConfigChangeLog::getAction, action);
        if (StringUtils.hasText(operator)) wrapper.eq(AiConfigChangeLog::getOperator, operator);
        if (StringUtils.hasText(keyword)) wrapper.like(AiConfigChangeLog::getConfigKey, keyword.trim());
        if (from != null) wrapper.ge(AiConfigChangeLog::getCreatedAt, from);
        if (to != null) wrapper.le(AiConfigChangeLog::getCreatedAt, to);
        Page<AiConfigChangeLog> result = changeLogMapper.selectPage(new Page<>(p, s), wrapper);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("records", result.getRecords());
        out.put("total", result.getTotal());
        out.put("page", p);
        out.put("size", s);
        return out;
    }

    private String toJson(Object value) {
        if (value == null) return null;
        if (value instanceof String text) return text;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max) + "…";
    }
}
