package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.AttendanceConstants;
import com.mftb.admin.dto.AttendanceSettingItem;
import com.mftb.admin.service.AttendanceSettingService;
import com.mftb.admin.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 假勤设置实现。
 * <p>
 * 两类项严格分开：
 * ① **可编辑**的只有判定引擎真读的口径参数（加班门槛、加班步长、冻结日），存 sys_config；
 * ② **只读说明**（计算粒度、宽限出处、旷工规则、来源优先级、同步时间、留存年限）——
 *    它们的真值分别在代码口径、考勤组表单与部署配置里，做成可编辑会出现「改了但判定不变」，
 *    那比没有这个页面更危险，因此一律只读并写清真值出处。
 * <p>
 * 修改加班参数不会自动回溯已算好的日报与月报（已冻结月份更不允许动），
 * 因此 update 一律返回 {@code needRecalculate=true}，界面必须把这句话显示给用户。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceSettingServiceImpl implements AttendanceSettingService {

    /** 可编辑项规格：前端 key、分组码、sys_config key、默认值与合法区间 */
    private record Spec(String key, String group, String configKey, int defaultValue, int min, int max) {
    }

    /* 分组码：前端按码映射分组标题与配色，后端不下发中文分组名 */
    private static final String GROUP_CALCULATION = "calculation";
    private static final String GROUP_OVERTIME = "overtime";
    private static final String GROUP_SOURCE = "source";
    private static final String GROUP_PAYROLL = "payroll";
    private static final String GROUP_RETENTION = "retention";

    /** 用 List 而不是 Map：设置页分组顺序必须稳定，Map.of 不保证迭代序 */
    private static final List<Spec> EDITABLE = List.of(
            new Spec("otThreshold", GROUP_OVERTIME, AttendanceConstants.CFG_OVERTIME_THRESHOLD_MIN,
                    AttendanceConstants.DEFAULT_OVERTIME_THRESHOLD_MIN, 0, 480),
            new Spec("otStep", GROUP_OVERTIME, AttendanceConstants.CFG_OVERTIME_STEP_MIN,
                    AttendanceConstants.DEFAULT_OVERTIME_STEP_MIN, 5, 240),
            new Spec("freezeDay", GROUP_PAYROLL, AttendanceConstants.CFG_FREEZE_DAY,
                    AttendanceConstants.DEFAULT_FREEZE_DAY, 1, 28));

    private final SysConfigService sysConfigService;

    /** 同步时间由部署配置决定，本页只展示不修改（改 cron 属于发布动作，不该在业务界面上做） */
    @Value("${attendance.sync.cron:0 0 6,22 * * ?}")
    private String syncCron;

    @Override
    public List<AttendanceSettingItem> list() {
        Map<String, String> configured = sysConfigService.getConfigValues(configKeys());
        List<AttendanceSettingItem> items = new ArrayList<>();

        // 只读口径说明：值全部交给前端翻译（valueKey），后端不下发任何语言的句子
        items.add(AttendanceSettingItem.readOnly("grain", GROUP_CALCULATION, "attendance.settingValueGrain"));
        items.add(AttendanceSettingItem.readOnly("grace", GROUP_CALCULATION, "attendance.settingValueGrace"));
        items.add(AttendanceSettingItem.readOnly("absentRule", GROUP_CALCULATION, "attendance.settingValueAbsentRule"));

        for (Spec spec : EDITABLE) {
            String raw = configured.get(spec.configKey());
            String value = StringUtils.hasText(raw) ? raw.trim() : String.valueOf(spec.defaultValue());
            items.add(AttendanceSettingItem.editable(spec.key(), spec.group(), value, spec.configKey()));
        }

        items.add(AttendanceSettingItem.readOnly("sourcePriority", GROUP_SOURCE, "attendance.settingValueSourcePriority"));
        // 同步 cron 是真实的部署配置，必须原样展示（不能翻成“每日 06:00”这种写死的句子）
        items.add(AttendanceSettingItem.runtime("syncTime", GROUP_SOURCE, syncCron));
        items.add(AttendanceSettingItem.readOnly("retention", GROUP_RETENTION, "attendance.settingValueRetention"));
        return items;
    }

    @Override
    @Transactional
    public Map<String, Object> update(Map<String, String> values) {
        if (values == null || values.isEmpty()) {
            throw new BusinessException("沒有需要保存的修改");
        }
        // 先整体校验再写入：部分成功会让用户以为全部生效
        Set<String> unknown = new LinkedHashSet<>(values.keySet());
        Map<String, String> toWrite = new LinkedHashMap<>();
        List<String> keys = new ArrayList<>();
        for (Spec spec : EDITABLE) {
            if (!values.containsKey(spec.key())) {
                continue;
            }
            unknown.remove(spec.key());
            toWrite.put(spec.configKey(), String.valueOf(requireInt(spec, values.get(spec.key()))));
            keys.add(spec.key());
        }
        if (!unknown.isEmpty()) {
            throw new BusinessException("以下項目為只讀口徑說明或不存在，不能在此修改: " + unknown);
        }
        if (toWrite.isEmpty()) {
            throw new BusinessException("沒有需要保存的修改");
        }

        sysConfigService.updateConfigs(toWrite);
        log.info("假勤口徑參數已更新: {} = {}", keys, toWrite);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("updated", toWrite.size());
        // 回前端 key 而不是中文标签：界面提示要自己翻译
        result.put("keys", keys);
        // 参数改了但历史结论不会自动变，界面必须把这句话讲清楚
        result.put("needRecalculate", true);
        return result;
    }

    /** 逐项按区间校验：非法值必须在写入前拒绝，不能让引擎回退默认值而界面显示另一个数 */
    private int requireInt(Spec spec, String raw) {
        if (!StringUtils.hasText(raw)) {
            throw new BusinessException("參數 " + spec.key() + " 不能為空");
        }
        int value;
        try {
            value = Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            throw new BusinessException("參數 " + spec.key() + " 必須是整數");
        }
        if (value < spec.min() || value > spec.max()) {
            throw new BusinessException("參數 " + spec.key() + " 允許範圍為 " + spec.min() + " ~ " + spec.max());
        }
        return value;
    }

    private Set<String> configKeys() {
        Set<String> keys = new LinkedHashSet<>();
        EDITABLE.forEach(spec -> keys.add(spec.configKey()));
        return keys;
    }
}
