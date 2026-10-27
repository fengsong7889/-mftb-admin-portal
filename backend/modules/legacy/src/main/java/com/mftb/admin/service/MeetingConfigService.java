package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingConfigDto;
import com.mftb.admin.entity.MeetingEvent;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingEventMapper;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 全局预约规则的读写（M2「預約規則」页的规则 Tab）。
 *
 * <p>规则落在 {@code sys_config} 的 {@code meeting_*} 键上，不建新表；但读写都必须经过本服务，
 * 理由有三：
 * <ol>
 *   <li><b>键白名单</b>：{@code sys_config} 是全系统共用键值表，开放任意键读写等于把会话超时、
 *       钉钉凭据一并交给会议页，那是横向越权；</li>
 *   <li><b>值合法性</b>：这里校验的是"规则之间是否自洽"（结束晚于开始、粒度不超过上限、
 *       上下限不倒挂）。{@code MeetingRuleService} 读到非法值时会兜底，但兜底等于把配错的规则
 *       静默藏起来，行政看到的数字与实际生效的数字就不是一回事；</li>
 *   <li><b>变更留痕</b>：全局规则一改就影响所有人的预约，必须能回答"谁在什么时候为什么改的"。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingConfigService {

    /** 审计轨迹里规则变更的 target_no 固定值（既不是某场会也不是某间房） */
    private static final String AUDIT_TARGET = "meeting_rules";
    private static final String TIME_PATTERN_ERROR = "時間格式應為 HH:mm";

    private final SysConfigService sysConfigService;
    private final MeetingRuleService ruleService;
    private final MeetingAccessGuard guard;
    private final MeetingAuditRecorder auditRecorder;
    private final MeetingEventMapper eventMapper;

    /** 读取当前生效规则（含"哪些键还没落库、正用代码兜底值"） */
    public MeetingConfigDto.RuleView view() {
        SysUser current = guard.currentUser();
        guard.requireRecordManager(current);
        MeetingRuleService.GlobalRule rule = ruleService.globalRule();
        MeetingConfigDto.RuleForm form = new MeetingConfigDto.RuleForm();
        form.setAdvanceDays(rule.getAdvanceDays());
        form.setMinLeadMinutes(rule.getMinLeadMinutes());
        form.setDefaultDuration(rule.getDefaultDurationMinutes());
        form.setMaxDuration(rule.getMaxDurationMinutes());
        form.setGranularityMinutes(rule.getGranularityMinutes());
        form.setBookableStart(rule.getBookableStart().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")));
        form.setBookableEnd(rule.getBookableEnd().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")));
        form.setRemindMinutes(rule.getRemindMinutes());
        form.setCheckinOpenMinutes(rule.getCheckinOpenMinutes());
        form.setReleaseAfterMinutes(rule.getReleaseAfterMinutes());
        form.setNoShowThreshold(intConfig(MeetingConstants.CFG_NO_SHOW_THRESHOLD, 0));
        form.setBlacklistDays(intConfig(MeetingConstants.CFG_BLACKLIST_DAYS, 7));

        MeetingConfigDto.RuleView view = new MeetingConfigDto.RuleView();
        view.setRule(form);
        view.setMissingKeys(missingKeys());
        // 最后修改人与时间：规则页必须能回答“这一屏数字是谁在哪天定的”，
        // 不然行政之间互相覆盖后根本无从追溯（sys_config 没有 updated_by 列，取审计轨迹）
        MeetingEvent latest = eventMapper.findLatestByTarget(AUDIT_TARGET, MeetingConstants.EVENT_CONFIG_UPDATE);
        if (latest != null) {
            view.setUpdatedBy(latest.getOperatorName());
            view.setUpdatedAt(DateTimeUtils.format(latest.getOccurredAt()));
        }
        return view;
    }

    /** 保存规则：逐键写入 sys_config，并把变更前后差异落审计 */
    @Transactional(rollbackFor = Exception.class)
    public void save(MeetingConfigDto.RuleForm form) {
        SysUser current = guard.currentUser();
        guard.requireRecordManager(current);
        validate(form);

        Map<String, String> before = new LinkedHashMap<>();
        Map<String, String> after = new LinkedHashMap<>();
        List<String> keys = new ArrayList<>();
        keys.add(MeetingConstants.CFG_ADVANCE_DAYS);
        keys.add(MeetingConstants.CFG_MIN_LEAD_MINUTES);
        keys.add(MeetingConstants.CFG_DEFAULT_DURATION);
        keys.add(MeetingConstants.CFG_MAX_DURATION);
        keys.add(MeetingConstants.CFG_TIME_GRANULARITY);
        keys.add(MeetingConstants.CFG_BOOKABLE_START);
        keys.add(MeetingConstants.CFG_BOOKABLE_END);
        keys.add(MeetingConstants.CFG_REMIND_MINUTES);
        keys.add(MeetingConstants.CFG_CHECKIN_OPEN_MINUTES);
        keys.add(MeetingConstants.CFG_RELEASE_AFTER);
        keys.add(MeetingConstants.CFG_NO_SHOW_THRESHOLD);
        keys.add(MeetingConstants.CFG_BLACKLIST_DAYS);
        Map<String, String> existing = sysConfigService.getConfigValues(keys);
        keys.forEach(key -> before.put(key, existing.get(key)));

        Map<String, String> values = new LinkedHashMap<>();
        values.put(MeetingConstants.CFG_ADVANCE_DAYS, String.valueOf(form.getAdvanceDays()));
        values.put(MeetingConstants.CFG_MIN_LEAD_MINUTES, String.valueOf(form.getMinLeadMinutes()));
        values.put(MeetingConstants.CFG_DEFAULT_DURATION, String.valueOf(form.getDefaultDuration()));
        values.put(MeetingConstants.CFG_MAX_DURATION, String.valueOf(form.getMaxDuration()));
        values.put(MeetingConstants.CFG_TIME_GRANULARITY, String.valueOf(form.getGranularityMinutes()));
        values.put(MeetingConstants.CFG_BOOKABLE_START, form.getBookableStart().trim());
        values.put(MeetingConstants.CFG_BOOKABLE_END, form.getBookableEnd().trim());
        values.put(MeetingConstants.CFG_REMIND_MINUTES, String.valueOf(form.getRemindMinutes()));
        values.put(MeetingConstants.CFG_CHECKIN_OPEN_MINUTES, String.valueOf(form.getCheckinOpenMinutes()));
        values.put(MeetingConstants.CFG_RELEASE_AFTER, String.valueOf(form.getReleaseAfterMinutes()));
        values.put(MeetingConstants.CFG_NO_SHOW_THRESHOLD, String.valueOf(form.getNoShowThreshold()));
        values.put(MeetingConstants.CFG_BLACKLIST_DAYS, String.valueOf(form.getBlacklistDays()));
        values.forEach((key, value) -> after.put(key, value));
        sysConfigService.updateConfigs(values);

        Map<String, Object> diff = new LinkedHashMap<>();
        diff.put("before", before);
        diff.put("after", after);
        auditRecorder.recordBooking(null, null, AUDIT_TARGET, MeetingConstants.EVENT_CONFIG_UPDATE,
                form.getChangeReason().trim(), before, after, current, null);
        log.info("全局預約規則已更新: operator={}, advanceDays={}, maxDuration={}",
                current.getName(), form.getAdvanceDays(), form.getMaxDuration());
    }

    /** 哪些键还没落库（此时页面上的数字来自代码兜底值，行政需要知道改的是哪里） */
    private List<String> missingKeys() {
        List<String> keys = List.of(MeetingConstants.CFG_ADVANCE_DAYS, MeetingConstants.CFG_MIN_LEAD_MINUTES,
                MeetingConstants.CFG_DEFAULT_DURATION, MeetingConstants.CFG_MAX_DURATION,
                MeetingConstants.CFG_TIME_GRANULARITY, MeetingConstants.CFG_BOOKABLE_START,
                MeetingConstants.CFG_BOOKABLE_END, MeetingConstants.CFG_REMIND_MINUTES,
                MeetingConstants.CFG_CHECKIN_OPEN_MINUTES, MeetingConstants.CFG_RELEASE_AFTER,
                MeetingConstants.CFG_NO_SHOW_THRESHOLD, MeetingConstants.CFG_BLACKLIST_DAYS);
        Map<String, String> existing = sysConfigService.getConfigValues(keys);
        return keys.stream().filter(key -> !StringUtils.hasText(existing.get(key))).toList();
    }

    private void validate(MeetingConfigDto.RuleForm form) {
        LocalTime start = parseTime(form.getBookableStart());
        LocalTime end = parseTime(form.getBookableEnd());
        if (!end.isAfter(start)) {
            throw new BusinessException("每日可預約結束時間必須晚於開始時間");
        }
        if (form.getGranularityMinutes() < 5 || form.getMaxDuration() < form.getGranularityMinutes()) {
            throw new BusinessException("單場最長時長不得小於時間粒度");
        }
        if (form.getDefaultDuration() < form.getGranularityMinutes()) {
            throw new BusinessException("默認時長不得小於時間粒度");
        }
        if (form.getDefaultDuration() > form.getMaxDuration()) {
            throw new BusinessException("默認時長不得大於單場最長時長");
        }
        int threshold = form.getNoShowThreshold();
        if (threshold > 0 && form.getBlacklistDays() <= 0) {
            throw new BusinessException("啟用自動拉黑時必須填寫限制天數");
        }
    }

    private static LocalTime parseTime(String value) {
        if (!StringUtils.hasText(value)) {
            throw new BusinessException(TIME_PATTERN_ERROR);
        }
        try {
            return LocalTime.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new BusinessException(TIME_PATTERN_ERROR);
        }
    }

    private int intConfig(String key, int fallback) {
        String raw = sysConfigService.getConfigValue(key);
        if (!StringUtils.hasText(raw)) {
            return fallback;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
