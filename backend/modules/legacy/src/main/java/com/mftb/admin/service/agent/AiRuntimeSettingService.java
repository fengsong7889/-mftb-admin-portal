package com.mftb.admin.service.agent;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiRuntimeSetting;
import com.mftb.admin.mapper.AiRuntimeSettingMapper;
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
 * AI 运行参数：键值配置，带默认值与范围校验。
 *
 * <p>只放“运营可调”的参数（记忆上限/保留期/注入条数/是否给记忆建议），
 * 安全阈值、权限范围、限流上限仍固定在代码里，避免把安全边界做成可配置项。
 * <p>读取失败一律回落默认值：配置表异常不能把助手整体打挂。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiRuntimeSettingService {

    public static final String MEMORY_MAX_COUNT = "memory.max_count";
    public static final String MEMORY_RETENTION_DAYS = "memory.retention_days";
    public static final String MEMORY_PROMPT_TOP = "memory.prompt_top";
    public static final String MEMORY_AUTO_SUGGEST = "memory.auto_suggest";

    /** 默认值 + 允许范围；list() 与 save() 共用同一份定义，避免页面与后端两套口径。 */
    private record Def(String key, String value, String type, String remark, int min, int max) {
    }

    private static final List<Def> DEFS = List.of(
            new Def(MEMORY_MAX_COUNT, "50", "int", "單個員工最多保存多少條記憶", 10, 500),
            new Def(MEMORY_RETENTION_DAYS, "180", "int", "記憶保留天數，到期自動失效", 7, 3650),
            new Def(MEMORY_PROMPT_TOP, "10", "int", "每次回答最多注入多少條相關記憶", 1, 30),
            new Def(MEMORY_AUTO_SUGGEST, "1", "bool", "是否從用戶消息給出「記住這條」建議（0=關閉）", 0, 1)
    );

    private final AiRuntimeSettingMapper settingMapper;
    private final AiConfigAuditService auditService;
    private final OperatorResolver operatorResolver;

    public int getInt(String key, int fallback) {
        String raw = rawValue(key);
        if (!StringUtils.hasText(raw)) return fallback;
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            log.warn("[AiRuntimeSetting] 值非法 key={} value={}", key, raw);
            return fallback;
        }
    }

    public boolean getBool(String key, boolean fallback) {
        String raw = rawValue(key);
        if (!StringUtils.hasText(raw)) return fallback;
        String v = raw.trim();
        if ("1".equals(v) || "true".equalsIgnoreCase(v)) return true;
        if ("0".equals(v) || "false".equalsIgnoreCase(v)) return false;
        return fallback;
    }

    /** 配置页展示：默认值与当前值合并，未落库的参数也能直接看到默认口径。 */
    public List<Map<String, Object>> list() {
        Map<String, AiRuntimeSetting> stored = new LinkedHashMap<>();
        try {
            for (AiRuntimeSetting row : settingMapper.selectList(null)) stored.put(row.getSettingKey(), row);
        } catch (Exception e) {
            log.warn("[AiRuntimeSetting] 读取配置失败，回退默认值: {}", e.getMessage());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Def def : DEFS) {
            AiRuntimeSetting row = stored.get(def.key());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", def.key());
            item.put("value", row == null || !StringUtils.hasText(row.getSettingValue())
                    ? def.value() : row.getSettingValue());
            item.put("defaultValue", def.value());
            item.put("type", def.type());
            item.put("remark", def.remark());
            item.put("min", def.min());
            item.put("max", def.max());
            item.put("updatedBy", row == null ? null : row.getUpdatedBy());
            item.put("updatedAt", row == null ? null : row.getUpdatedAt());
            out.add(item);
        }
        return out;
    }

    /** 保存：只接受已登记的键，逐个做范围校验；未知键直接拒绝而不是静默忽略。 */
    @Transactional
    public void save(Map<String, String> values) {
        if (values == null || values.isEmpty()) throw new BusinessException("沒有需要保存的參數");
        String operator = operatorResolver.currentOperatorName();
        for (Map.Entry<String, String> entry : values.entrySet()) {
            Def def = DEFS.stream().filter(d -> d.key().equals(entry.getKey())).findFirst()
                    .orElseThrow(() -> new BusinessException("未知的配置項：" + entry.getKey()));
            String value = entry.getValue() == null ? "" : entry.getValue().trim();
            int parsed;
            try {
                parsed = Integer.parseInt(value);
            } catch (NumberFormatException e) {
                throw new BusinessException(def.key() + " 必須是整數");
            }
            if (parsed < def.min() || parsed > def.max()) {
                throw new BusinessException(def.key() + " 必須在 " + def.min() + " ~ " + def.max() + " 之間");
            }
            AiRuntimeSetting row = settingMapper.selectById(def.key());
            if (row == null) {
                row = new AiRuntimeSetting();
                row.setSettingKey(def.key());
                row.setSettingValue(String.valueOf(parsed));
                row.setValueType(def.type());
                row.setRemark(def.remark());
                row.setUpdatedBy(operator);
                settingMapper.insert(row);
            } else {
                row.setSettingValue(String.valueOf(parsed));
                row.setUpdatedBy(operator);
                settingMapper.updateById(row);
            }
            auditService.record("runtime_setting", def.key(), "update", null,
                    Map.of("value", parsed));
        }
    }

    private String rawValue(String key) {
        try {
            AiRuntimeSetting row = settingMapper.selectById(key);
            return row == null ? null : row.getSettingValue();
        } catch (Exception e) {
            log.warn("[AiRuntimeSetting] 读取 {} 失败，使用默认值: {}", key, e.getMessage());
            return null;
        }
    }
}
