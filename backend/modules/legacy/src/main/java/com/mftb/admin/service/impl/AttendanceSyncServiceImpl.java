package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttPunchLog;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.AttendancePunchService;
import com.mftb.admin.service.AttendanceSyncService;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 钉钉考勤同步实现。
 * <p>
 * 四条不可让步的口径：
 * ① 身份只认 {@code sys_user.dingtalk_user_id} 的显式绑定，**绝不按姓名匹配**——
 *    同名员工张冠李戴会污染别人的考勤结论，且事后极难发现；未绑定的人只计数不猜；
 * ② 幂等与 work_date 归属都交给 {@link AttendancePunchService#saveGenerated}，
 *    同步侧一律留空，规则只允许有一处实现；
 * ③ 失败只记录并抛出可读原因，绝不"先删后写"：清空历史再重跑，一旦上游返回不全就是永久丢数；
 * ④ 未配置应用时直接报错，不回退到任何默认凭据。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttendanceSyncServiceImpl implements AttendanceSyncService {

    /** 同步用哪个钉钉应用：数据库配置优先，与既有「系统配置统一化」口径一致 */
    public static final String CONFIG_APP_ID = "attendance_dingtalk_app_id";
    private static final String API_LIST = "topapi/attendance/list";
    /** 钉钉单次请求的人数上限 */
    private static final int USER_BATCH = 20;
    private static final int PAGE_LIMIT = 100;
    /** 钉钉单次查询的日期跨度上限（天） */
    private static final int DATE_SPAN_DAYS = 30;
    private static final String SYNC_OPERATOR = "dingtalk-sync";

    private final DingTalkAppService dingTalkAppService;
    private final SysConfigService sysConfigService;
    private final SysUserMapper sysUserMapper;
    private final AttGroupMapper groupMapper;
    private final AttGroupMemberMapper memberMapper;
    private final AttendancePunchService punchService;
    private final OrgScopeService orgScopeService;

    @Override
    public Map<String, Object> sync(LocalDate from, LocalDate to, Long groupId) {
        if (from == null || to == null || from.isAfter(to)) {
            throw new BusinessException("同步日期區間不合法");
        }
        // 同步是从钉钉按整组人员拉事实并落库，属组织级运维动作：按人收敛会做出「半天有卡、
        // 半天没卡」的隐性错账，所以只允许范围不限制的角色手动触发。
        // 夜间定时任务没有 SecurityContext，OrgScopeServiceImpl 按「不限制」放行，不受本门槛影响。
        if (orgScopeService.resolveVisibleUserIds() != null) {
            throw new BusinessException("打卡同步為整組作業，需具備「全部」數據範圍的角色才能手動觸發");
        }
        long appId = requireAppId();
        List<AttGroupMember> members = membersInRange(groupId, from, to);
        Map<Long, String> dingIdByUser = dingIdsOf(members);

        int pulled = 0;
        int inserted = 0;
        int skippedUnbound = 0;
        for (List<AttGroupMember> batch : partition(members, USER_BATCH)) {
            List<AttGroupMember> bound = new ArrayList<>();
            List<String> userIds = new ArrayList<>();
            for (AttGroupMember member : batch) {
                String dingId = dingIdByUser.get(member.getUserId());
                if (dingId == null) {
                    skippedUnbound++;
                    continue;
                }
                bound.add(member);
                userIds.add(dingId);
            }
            if (userIds.isEmpty()) {
                continue;
            }
            for (LocalDate cursor = from; !cursor.isAfter(to); cursor = cursor.plusDays(DATE_SPAN_DAYS)) {
                LocalDate sliceEnd = cursor.plusDays(DATE_SPAN_DAYS - 1).isAfter(to) ? to : cursor.plusDays(DATE_SPAN_DAYS - 1);
                List<Map<String, Object>> records = pull(appId, cursor, sliceEnd, userIds);
                pulled += records.size();
                inserted += saveAll(records, bound, dingIdByUser);
            }
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("from", from.toString());
        summary.put("to", to.toString());
        summary.put("pulled", pulled);
        summary.put("inserted", inserted);
        summary.put("duplicated", Math.max(0, pulled - inserted));
        summary.put("skippedUnbound", skippedUnbound);
        log.info("考勤打卡同步完成: 区间={}~{}, 拉取={}, 入庫={}, 未綁定跳過={}",
                from, to, pulled, inserted, skippedUnbound);
        return summary;
    }

    /* ==================== 内部 ==================== */

    private long requireAppId() {
        String raw = sysConfigService.getConfigValueCached(CONFIG_APP_ID);
        if (!StringUtils.hasText(raw) || !raw.trim().matches("\\d+")) {
            throw new BusinessException("尚未配置釘釘同步應用，請在系統配置中指定 " + CONFIG_APP_ID);
        }
        return Long.parseLong(raw.trim());
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> pull(long appId, LocalDate from, LocalDate to, List<String> dingUserIds) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("workDateFrom", from + " 00:00:00");
        body.put("workDateTo", to + " 23:59:59");
        body.put("userIdList", dingUserIds);
        body.put("offset", 0L);
        body.put("limit", (long) PAGE_LIMIT);
        Map<String, Object> response = dingTalkAppService.callApi(appId, API_LIST, body);
        Object records = response.get("recordresult");
        if (records instanceof List<?> list) {
            return list.stream().filter(Map.class::isInstance).map(item -> (Map<String, Object>) item).toList();
        }
        return List.of();
    }

    /** 把钉钉返回的打卡记录转成本地流水；未绑定与时间缺失的记录直接跳过（不猜身份、不猜时间） */
    private int saveAll(List<Map<String, Object>> records, List<AttGroupMember> batch, Map<Long, String> dingIdByUser) {
        Map<String, AttGroupMember> byDingId = new HashMap<>();
        for (AttGroupMember member : batch) {
            String dingId = dingIdByUser.get(member.getUserId());
            if (dingId != null) {
                byDingId.put(dingId, member);
            }
        }
        List<AttPunchLog> prepared = new ArrayList<>();
        for (Map<String, Object> record : records) {
            AttGroupMember member = byDingId.get(text(record.get("userId")));
            LocalDateTime at = toDateTime(record.get("userCheckTime"));
            if (member == null || at == null) {
                continue;
            }
            String location = text(record.get("userAddress"));
            AttPunchLog punch = new AttPunchLog();
            punch.setUserId(member.getUserId());
            punch.setEmpNo(member.getEmpNo());
            punch.setEmpName(member.getEmpName());
            punch.setGroupId(member.getGroupId());
            punch.setPunchAt(at);
            punch.setPunchType("OffDuty".equals(text(record.get("checkType")))
                    ? AttPunchLog.TYPE_OFF : AttPunchLog.TYPE_ON);
            punch.setSource(AttPunchLog.SOURCE_DINGTALK);
            punch.setLocation(location);
            punch.setRawRef(text(record.get("id")));
            punch.setResult("Outside".equals(text(record.get("locationResult")))
                    ? AttPunchLog.RESULT_OUTSIDE : AttPunchLog.RESULT_NORMAL);
            // work_date 故意留空：归属规则只在 saveGenerated 里实现一次
            punch.setCreatedBy(SYNC_OPERATOR);
            punch.setUpdatedBy(SYNC_OPERATOR);
            prepared.add(punch);
        }
        return punchService.saveGenerated(prepared);
    }

    /** 一次批量查 sys_user 拿到绑定关系，避免逐行回查 */
    private Map<Long, String> dingIdsOf(List<AttGroupMember> members) {
        Set<Long> userIds = members.stream().map(AttGroupMember::getUserId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (userIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> mapping = new HashMap<>();
        for (SysUser user : sysUserMapper.selectBatchIds(userIds)) {
            if (StringUtils.hasText(user.getDingtalkUserId())) {
                mapping.put(user.getId(), user.getDingtalkUserId().trim());
            }
        }
        return mapping;
    }

    private List<AttGroupMember> membersInRange(Long groupId, LocalDate from, LocalDate to) {
        LambdaQueryWrapper<AttGroupMember> wrapper = new LambdaQueryWrapper<AttGroupMember>()
                .le(AttGroupMember::getValidFrom, to)
                .and(w -> w.isNull(AttGroupMember::getValidTo).or().ge(AttGroupMember::getValidTo, from));
        if (groupId != null) {
            wrapper.eq(AttGroupMember::getGroupId, groupId);
        } else {
            Set<Long> enabledGroupIds = groupMapper.selectList(new LambdaQueryWrapper<AttGroup>()
                            .eq(AttGroup::getStatus, "enabled"))
                    .stream().map(AttGroup::getId).collect(Collectors.toSet());
            if (enabledGroupIds.isEmpty()) {
                return List.of();
            }
            wrapper.in(AttGroupMember::getGroupId, enabledGroupIds);
        }
        return memberMapper.selectList(wrapper);
    }

    private static <T> List<List<T>> partition(List<T> source, int size) {
        List<List<T>> batches = new ArrayList<>();
        for (int index = 0; index < source.size(); index += size) {
            batches.add(source.subList(index, Math.min(index + size, source.size())));
        }
        return batches;
    }

    private static LocalDateTime toDateTime(Object millis) {
        if (!(millis instanceof Number number)) {
            return null;
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(number.longValue()), ZoneId.systemDefault());
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
