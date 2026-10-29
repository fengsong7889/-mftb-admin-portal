package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingConfigDto;
import com.mftb.admin.entity.MeetingEvent;
import com.mftb.admin.entity.MeetingRoom;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingEventMapper;
import com.mftb.admin.mapper.MeetingRoomMapper;
import com.mftb.admin.util.DateTimeUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;

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
    private final MeetingRoomMapper roomMapper;
    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

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
        form.setMinDuration(rule.getMinDurationMinutes());
        form.setCheckinRequired(rule.getCheckinRequired());

        MeetingConfigDto.RuleView view = new MeetingConfigDto.RuleView();
        view.setRule(form);
        view.setMissingKeys(missingKeys());
        // 版本与写权限都由服务端给出：前端不自行复算权限，也不猜“这次能不能存”
        view.setVersion(configVersion());
        view.setCanEdit(guard.canOperateRecords(current));
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
        // 乐观锁：别人先改过规则就先刷新，避免拿旧继承基准覆盖（房间保存也带此版本）
        Integer expectVersion = form.getVersion();
        if (expectVersion != null && expectVersion != configVersion()) {
            throw new BusinessException("規則已被他人修改，請刷新後重試");
        }
        // 改通用值会改变“继承这些字段的房间”的有效组合：先逐间预演，冲突则整体拒绝
        assertNoRoomConflict(form);

        Map<String, String> before = new LinkedHashMap<>();
        Map<String, String> after = new LinkedHashMap<>();
        List<String> keys = new ArrayList<>();
        keys.add(MeetingConstants.CFG_ADVANCE_DAYS);
        keys.add(MeetingConstants.CFG_MIN_LEAD_MINUTES);
        keys.add(MeetingConstants.CFG_DEFAULT_DURATION);
        keys.add(MeetingConstants.CFG_MAX_DURATION);
        keys.add(MeetingConstants.CFG_MIN_DURATION);
        keys.add(MeetingConstants.CFG_CHECKIN_REQUIRED);
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
        values.put(MeetingConstants.CFG_MIN_DURATION, String.valueOf(form.getMinDuration()));
        values.put(MeetingConstants.CFG_CHECKIN_REQUIRED, String.valueOf(form.getCheckinRequired()));
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
        bumpVersion();

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
                MeetingConstants.CFG_NO_SHOW_THRESHOLD, MeetingConstants.CFG_BLACKLIST_DAYS,
                MeetingConstants.CFG_MIN_DURATION, MeetingConstants.CFG_CHECKIN_REQUIRED);
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
        if (form.getMinDuration() == null || form.getMaxDuration() < form.getMinDuration()) {
            throw new BusinessException("單場最長時長不得小於最短時長");
        }
        if (form.getDefaultDuration() < form.getMinDuration()) {
            throw new BusinessException("默認時長不得小於單場最短時長");
        }
        if (form.getCheckinRequired() != null && form.getCheckinRequired() != 0 && form.getCheckinRequired() != 1) {
            throw new BusinessException("簽到保留默認值只能為 0 或 1");
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

    /* ==================== 规则版本 ==================== */

    /** 当前规则集版本（通用/房间共用）；缺失或非法按 0 处理 */
    public int configVersion() {
        return intConfig(MeetingConstants.CFG_RULE_VERSION, 0);
    }

    private void bumpVersion() {
        sysConfigService.updateConfigs(Map.of(MeetingConstants.CFG_RULE_VERSION,
                String.valueOf(configVersion() + 1)));
    }

    /* ==================== 会议室专属规则 ==================== */

    public MeetingConfigDto.RoomRulePage listRoomRules(MeetingConfigDto.RoomRuleQuery query) {
        SysUser current = guard.currentUser();
        requireRuleReader(current);
        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        String keyword = query.getKeyword() == null ? "" : query.getKeyword().trim();
        String source = query.getSource() == null ? "all" : query.getSource();
        // 房间数量是几十级：全部取出后在内存里过滤/分页，避免「先分页再算来源」导致总数与筛选不一致
        List<MeetingRoom> rooms = roomMapper.selectList(new LambdaQueryWrapper<MeetingRoom>()
                .orderByAsc(MeetingRoom::getRoomNo));
        List<MeetingConfigDto.RoomRuleRow> rows = new ArrayList<>();
        for (MeetingRoom room : rooms) {
            String location = locationText(room);
            if (!keyword.isEmpty() && !(contains(room.getRoomNo(), keyword) || contains(room.getRoomName(), keyword)
                    || contains(location, keyword))) {
                continue;
            }
            boolean custom = anyOverride(room);
            if ("custom".equals(source) && !custom) continue;
            if ("inherit".equals(source) && custom) continue;
            MeetingConfigDto.RoomRuleOverrides eff = resolve(room, global);
            MeetingConfigDto.RoomRuleRow row = new MeetingConfigDto.RoomRuleRow();
            row.setRoomId(room.getId());
            row.setRoomNo(room.getRoomNo());
            row.setRoomName(room.getRoomName());
            row.setLocationText(location);
            row.setSource(custom ? "custom" : "inherit");
            row.setBookableStart(eff.getBookableStart());
            row.setBookableEnd(eff.getBookableEnd());
            row.setMinDuration(eff.getMinDuration());
            row.setMaxDuration(eff.getMaxDuration());
            row.setCheckinRequired(eff.getCheckinRequired());
            row.setVersion(room.getVersion());
            rows.add(row);
        }
        int size = query.getSize() == null ? 20 : Math.max(1, Math.min(100, query.getSize()));
        int page = query.getPage() == null ? 1 : Math.max(1, query.getPage());
        int from = Math.min(rows.size(), (page - 1) * size);
        int to = Math.min(rows.size(), from + size);
        MeetingConfigDto.RoomRulePage result = new MeetingConfigDto.RoomRulePage();
        result.setRecords(new ArrayList<>(rows.subList(from, to)));
        result.setTotal(rows.size());
        result.setConfigVersion(configVersion());
        return result;
    }

    public MeetingConfigDto.RoomRuleView viewRoomRules(long roomId) {
        SysUser current = guard.currentUser();
        requireRuleReader(current);
        MeetingRoom room = roomMapper.selectById(roomId);
        if (room == null) {
            throw new BusinessException("會議室不存在或已刪除");
        }
        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        MeetingConfigDto.RoomRuleView view = new MeetingConfigDto.RoomRuleView();
        view.setRoomId(room.getId());
        view.setRoomNo(room.getRoomNo());
        view.setRoomName(room.getRoomName());
        view.setLocationText(locationText(room));
        view.setOverrides(overridesOf(room));
        view.setEffective(resolve(room, global));
        view.setSources(sourcesOf(room));
        view.setRoomVersion(room.getVersion());
        view.setConfigVersion(configVersion());
        view.setCanEdit(guard.canManageRoom(current));
        return view;
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveRoomRules(long roomId, MeetingConfigDto.RoomRuleForm form) {
        SysUser current = guard.currentUser();
        guard.requireRoomManage(current);
        // 房间保存依赖当前通用值作继承基准：通用规则已被改过就必须先刷新，否则会存下错误的有效组合
        if (!Objects.equals(form.getExpectConfigVersion(), configVersion())) {
            throw new BusinessException("通用規則已變更，請刷新後重試");
        }
        MeetingRoom room = roomMapper.selectById(roomId);
        if (room == null) {
            throw new BusinessException("會議室不存在或已刪除");
        }
        if (!Objects.equals(form.getExpectRoomVersion(), room.getVersion())) {
            throw new BusinessException("該房間已被他人修改，請刷新後重試");
        }
        MeetingConfigDto.RoomRuleOverrides ov = form.getOverrides();
        boolean hasStart = StringUtils.hasText(ov.getBookableStart());
        boolean hasEnd = StringUtils.hasText(ov.getBookableEnd());
        if (hasStart != hasEnd) {
            throw new BusinessException("每日可預約起止時間需一起填寫或一起繼承");
        }
        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        String invalid = checkCombo(resolve(ov, global));
        if (invalid != null) {
            throw new BusinessException(invalid);
        }
        Map<String, Object> before = snapshotRoom(room);
        LambdaUpdateWrapper<MeetingRoom> update = new LambdaUpdateWrapper<MeetingRoom>()
                .eq(MeetingRoom::getId, roomId)
                .eq(MeetingRoom::getVersion, room.getVersion())
                .set(MeetingRoom::getBookableStartTime, timeOrNull(ov.getBookableStart()))
                .set(MeetingRoom::getBookableEndTime, timeOrNull(ov.getBookableEnd()))
                .set(MeetingRoom::getMinDuration, ov.getMinDuration())
                .set(MeetingRoom::getMaxDuration, ov.getMaxDuration())
                .set(MeetingRoom::getAdvanceDays, ov.getAdvanceDays())
                .set(MeetingRoom::getMinLeadMinutes, ov.getMinLeadMinutes())
                .set(MeetingRoom::getGranularityMinutes, ov.getGranularityMinutes())
                .set(MeetingRoom::getDefaultDuration, ov.getDefaultDuration())
                .set(MeetingRoom::getRemindMinutes, ov.getRemindMinutes())
                .set(MeetingRoom::getCheckinOpenMinutes, ov.getCheckinOpenMinutes())
                .set(MeetingRoom::getReleaseAfterMinutes, ov.getReleaseAfterMinutes())
                .set(MeetingRoom::getCheckinRequired, ov.getCheckinRequired())
                .set(MeetingRoom::getUpdatedBy, current.getName())
                .setSql("version = version + 1");
        if (roomMapper.update(null, update) == 0) {
            throw new BusinessException("該房間已被他人修改，請刷新後重試");
        }
        bumpVersion();
        MeetingRoom saved = roomMapper.selectById(roomId);
        auditRecorder.recordBooking(null, roomId, room.getRoomNo(), MeetingConstants.EVENT_CONFIG_UPDATE,
                form.getChangeReason().trim(), before, snapshotRoom(saved), current, null);
        log.info("會議室專屬規則已更新: room={}, operator={}", room.getRoomNo(), current.getName());
    }

    /* ---------- 房间规则辅助 ---------- */

    private void requireRuleReader(SysUser user) {
        if (!guard.canManageRoom(user) && !guard.canOperateRecords(user)) {
            throw new BusinessException("無權查看預約規則，請在「預約規則」由行政查看");
        }
    }

    /** 通用值改动后预演每间房：任何房间的合并结果非法则整体拒绝，不静默改变生效行为 */
    private void assertNoRoomConflict(MeetingConfigDto.RuleForm form) {
        List<MeetingRoom> rooms = roomMapper.selectList(new LambdaQueryWrapper<MeetingRoom>());
        List<String> conflicts = new ArrayList<>();
        for (MeetingRoom room : rooms) {
            String invalid = checkCombo(resolveWithForm(room, form));
            if (invalid != null) {
                conflicts.add(room.getRoomNo() + " " + invalid);
                if (conflicts.size() >= 5) break;
            }
        }
        if (!conflicts.isEmpty()) {
            throw new BusinessException("修改通用規則將使以下房間規則衝突，請先調整房間專屬值："
                    + String.join("；", conflicts));
        }
    }

    private MeetingConfigDto.RoomRuleOverrides resolveWithForm(MeetingRoom room, MeetingConfigDto.RuleForm form) {
        MeetingConfigDto.RoomRuleOverrides o = new MeetingConfigDto.RoomRuleOverrides();
        o.setAdvanceDays(pick(room.getAdvanceDays(), form.getAdvanceDays()));
        o.setMinLeadMinutes(pick(room.getMinLeadMinutes(), form.getMinLeadMinutes()));
        o.setGranularityMinutes(pick(room.getGranularityMinutes(), form.getGranularityMinutes()));
        o.setDefaultDuration(pick(room.getDefaultDuration(), form.getDefaultDuration()));
        o.setMinDuration(pick(room.getMinDuration(), form.getMinDuration()));
        o.setMaxDuration(pick(room.getMaxDuration(), form.getMaxDuration()));
        o.setRemindMinutes(pick(room.getRemindMinutes(), form.getRemindMinutes()));
        o.setCheckinOpenMinutes(pick(room.getCheckinOpenMinutes(), form.getCheckinOpenMinutes()));
        o.setReleaseAfterMinutes(pick(room.getReleaseAfterMinutes(), form.getReleaseAfterMinutes()));
        o.setCheckinRequired(pick(room.getCheckinRequired(), form.getCheckinRequired()));
        o.setBookableStart(room.getBookableStartTime() != null ? hhmm(room.getBookableStartTime()) : form.getBookableStart());
        o.setBookableEnd(room.getBookableEndTime() != null ? hhmm(room.getBookableEndTime()) : form.getBookableEnd());
        return o;
    }

    private MeetingConfigDto.RoomRuleOverrides overridesOf(MeetingRoom room) {
        MeetingConfigDto.RoomRuleOverrides o = new MeetingConfigDto.RoomRuleOverrides();
        o.setAdvanceDays(room.getAdvanceDays());
        o.setMinLeadMinutes(room.getMinLeadMinutes());
        o.setGranularityMinutes(room.getGranularityMinutes());
        o.setDefaultDuration(room.getDefaultDuration());
        o.setMinDuration(room.getMinDuration());
        o.setMaxDuration(room.getMaxDuration());
        o.setRemindMinutes(room.getRemindMinutes());
        o.setCheckinOpenMinutes(room.getCheckinOpenMinutes());
        o.setReleaseAfterMinutes(room.getReleaseAfterMinutes());
        o.setCheckinRequired(room.getCheckinRequired());
        o.setBookableStart(room.getBookableStartTime() == null ? null : hhmm(room.getBookableStartTime()));
        o.setBookableEnd(room.getBookableEndTime() == null ? null : hhmm(room.getBookableEndTime()));
        return o;
    }

    private MeetingConfigDto.RoomRuleOverrides resolve(MeetingRoom room, MeetingRuleService.GlobalRule g) {
        MeetingConfigDto.RoomRuleOverrides o = new MeetingConfigDto.RoomRuleOverrides();
        o.setAdvanceDays(pick(room.getAdvanceDays(), g.getAdvanceDays()));
        o.setMinLeadMinutes(pick(room.getMinLeadMinutes(), g.getMinLeadMinutes()));
        o.setGranularityMinutes(pick(room.getGranularityMinutes(), g.getGranularityMinutes()));
        o.setDefaultDuration(pick(room.getDefaultDuration(), g.getDefaultDurationMinutes()));
        o.setMinDuration(pick(room.getMinDuration(), g.getMinDurationMinutes()));
        o.setMaxDuration(pick(room.getMaxDuration(), g.getMaxDurationMinutes()));
        o.setRemindMinutes(pick(room.getRemindMinutes(), g.getRemindMinutes()));
        o.setCheckinOpenMinutes(pick(room.getCheckinOpenMinutes(), g.getCheckinOpenMinutes()));
        o.setReleaseAfterMinutes(pick(room.getReleaseAfterMinutes(), g.getReleaseAfterMinutes()));
        o.setCheckinRequired(pick(room.getCheckinRequired(), g.getCheckinRequired()));
        o.setBookableStart(hhmm(room.getBookableStartTime() != null ? room.getBookableStartTime() : g.getBookableStart()));
        o.setBookableEnd(hhmm(room.getBookableEndTime() != null ? room.getBookableEndTime() : g.getBookableEnd()));
        return o;
    }

    private MeetingConfigDto.RoomRuleOverrides resolve(MeetingConfigDto.RoomRuleOverrides ov, MeetingRuleService.GlobalRule g) {
        MeetingConfigDto.RoomRuleOverrides o = new MeetingConfigDto.RoomRuleOverrides();
        o.setAdvanceDays(pick(ov.getAdvanceDays(), g.getAdvanceDays()));
        o.setMinLeadMinutes(pick(ov.getMinLeadMinutes(), g.getMinLeadMinutes()));
        o.setGranularityMinutes(pick(ov.getGranularityMinutes(), g.getGranularityMinutes()));
        o.setDefaultDuration(pick(ov.getDefaultDuration(), g.getDefaultDurationMinutes()));
        o.setMinDuration(pick(ov.getMinDuration(), g.getMinDurationMinutes()));
        o.setMaxDuration(pick(ov.getMaxDuration(), g.getMaxDurationMinutes()));
        o.setRemindMinutes(pick(ov.getRemindMinutes(), g.getRemindMinutes()));
        o.setCheckinOpenMinutes(pick(ov.getCheckinOpenMinutes(), g.getCheckinOpenMinutes()));
        o.setReleaseAfterMinutes(pick(ov.getReleaseAfterMinutes(), g.getReleaseAfterMinutes()));
        o.setCheckinRequired(pick(ov.getCheckinRequired(), g.getCheckinRequired()));
        o.setBookableStart(StringUtils.hasText(ov.getBookableStart()) ? ov.getBookableStart() : hhmm(g.getBookableStart()));
        o.setBookableEnd(StringUtils.hasText(ov.getBookableEnd()) ? ov.getBookableEnd() : hhmm(g.getBookableEnd()));
        return o;
    }

    /** 合并后的有效性：不合法返回可读原因，合法返回 null */
    private static String checkCombo(MeetingConfigDto.RoomRuleOverrides o) {
        if (!range(o.getAdvanceDays(), 1, 365)) return "最遠可預約天數需在 1~365 天";
        if (!range(o.getMinLeadMinutes(), 0, 1440)) return "最少提前分鐘需在 0~1440";
        if (o.getGranularityMinutes() == null || !List.of(5, 10, 15, 20, 30, 60).contains(o.getGranularityMinutes())) {
            return "時間粒度只能為 5/10/15/20/30/60";
        }
        if (!range(o.getDefaultDuration(), 1, 720)) return "默認時長需在 1~720 分鐘";
        if (!range(o.getMinDuration(), 1, 720)) return "單場最短時長需在 1~720 分鐘";
        if (!range(o.getMaxDuration(), 1, 720)) return "單場最長時長需在 1~720 分鐘";
        if (o.getMinDuration() > o.getDefaultDuration()) return "單場最短時長不得大於默認時長";
        if (o.getDefaultDuration() > o.getMaxDuration()) return "默認時長不得大於單場最長時長";
        if (!range(o.getRemindMinutes(), 0, 1440)) return "開始前提醒需在 0~1440 分鐘";
        if (!range(o.getCheckinOpenMinutes(), 0, 120)) return "可提前簽到需在 0~120 分鐘";
        if (!range(o.getReleaseAfterMinutes(), 1, 240)) return "未簽到自動釋放需在 1~240 分鐘";
        LocalTime start = timeOrNull(o.getBookableStart());
        LocalTime end = timeOrNull(o.getBookableEnd());
        if (start == null || end == null) return "每日可預約起止時間格式應為 HH:mm";
        if (!end.isAfter(start)) return "每日可預約結束時間必須晚於開始時間";
        return null;
    }

    private static boolean range(Integer value, int min, int max) {
        return value != null && value >= min && value <= max;
    }

    private static <T> T pick(T roomValue, T globalValue) {
        return roomValue != null ? roomValue : globalValue;
    }

    private static boolean anyOverride(MeetingRoom room) {
        return room.getBookableStartTime() != null || room.getBookableEndTime() != null
                || room.getMinDuration() != null || room.getMaxDuration() != null
                || room.getAdvanceDays() != null || room.getMinLeadMinutes() != null
                || room.getGranularityMinutes() != null || room.getDefaultDuration() != null
                || room.getRemindMinutes() != null || room.getCheckinOpenMinutes() != null
                || room.getReleaseAfterMinutes() != null || room.getCheckinRequired() != null;
    }

    private static Map<String, String> sourcesOf(MeetingRoom room) {
        Map<String, String> s = new LinkedHashMap<>();
        s.put("advanceDays", room.getAdvanceDays() != null ? "room" : "global");
        s.put("minLeadMinutes", room.getMinLeadMinutes() != null ? "room" : "global");
        s.put("granularityMinutes", room.getGranularityMinutes() != null ? "room" : "global");
        s.put("defaultDuration", room.getDefaultDuration() != null ? "room" : "global");
        s.put("minDuration", room.getMinDuration() != null ? "room" : "global");
        s.put("maxDuration", room.getMaxDuration() != null ? "room" : "global");
        s.put("bookableWindow", room.getBookableStartTime() != null || room.getBookableEndTime() != null ? "room" : "global");
        s.put("remindMinutes", room.getRemindMinutes() != null ? "room" : "global");
        s.put("checkinOpenMinutes", room.getCheckinOpenMinutes() != null ? "room" : "global");
        s.put("releaseAfterMinutes", room.getReleaseAfterMinutes() != null ? "room" : "global");
        s.put("checkinRequired", room.getCheckinRequired() != null ? "room" : "global");
        return s;
    }

    private static Map<String, Object> snapshotRoom(MeetingRoom room) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bookableStart", room.getBookableStartTime() == null ? null : hhmm(room.getBookableStartTime()));
        m.put("bookableEnd", room.getBookableEndTime() == null ? null : hhmm(room.getBookableEndTime()));
        m.put("minDuration", room.getMinDuration());
        m.put("maxDuration", room.getMaxDuration());
        m.put("advanceDays", room.getAdvanceDays());
        m.put("minLeadMinutes", room.getMinLeadMinutes());
        m.put("granularityMinutes", room.getGranularityMinutes());
        m.put("defaultDuration", room.getDefaultDuration());
        m.put("remindMinutes", room.getRemindMinutes());
        m.put("checkinOpenMinutes", room.getCheckinOpenMinutes());
        m.put("releaseAfterMinutes", room.getReleaseAfterMinutes());
        m.put("checkinRequired", room.getCheckinRequired());
        return m;
    }

    private static String locationText(MeetingRoom room) {
        StringBuilder sb = new StringBuilder();
        for (String part : new String[]{room.getCampus(), room.getBuilding(), room.getFloorCode(), room.getLocationDesc()}) {
            if (StringUtils.hasText(part)) {
                if (sb.length() > 0) sb.append(" · ");
                sb.append(part.trim());
            }
        }
        return sb.toString();
    }

    private static boolean contains(String text, String keyword) {
        return text != null && text.contains(keyword);
    }

    private static String hhmm(LocalTime time) {
        return time == null ? null : time.format(HH_MM);
    }

    private static LocalTime timeOrNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            String v = value.trim();
            return LocalTime.parse(v.length() <= 5 ? v + ":00" : v);
        } catch (RuntimeException e) {
            return null;
        }
    }
}
