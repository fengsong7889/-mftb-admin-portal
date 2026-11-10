package com.mftb.admin.config;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesItem;
import com.mftb.admin.entity.MeetingMinutesItemOwner;
import com.mftb.admin.entity.SysNotificationSwitch;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingMinutesItemMapper;
import com.mftb.admin.mapper.MeetingMinutesItemOwnerMapper;
import com.mftb.admin.mapper.MeetingMinutesMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.MeetingMinutesRenderer;
import com.mftb.admin.service.MeetingNotifyTemplateService;
import com.mftb.admin.service.NotificationAppService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * 跟进事项逾期提醒作业。
 *
 * <p>为什么用"先抢占再发送"：{@code markNotified} 的条件更新只在"今天还没提醒过"时返回 1。
 * 多实例同时扫描，只有一个实例能拿到这一行，负责人不会在同一分钟收到两条一样的催办；
 * 若改成"发完再标记"，两条卡片的时差正好大于 HTTP 往返，必重。
 *
 * <p>抢占后发送失败<b>不再</b>当天重试：失败原因多半是凭据失效/网络，一小时内重试同样失败，
 * 而失败会打 error 日志留痕。宁可晚一天，也不要给同一个人连续弹同一件事。
 *
 * <p>被静音/未绑定应用/负责人没绑钉钉时也标记为已提醒：这些是配置问题，不是"该发没发"，
 * 不标记就会每小时空扫一遍同一批行。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MeetingFollowUpJob {

    /** 单轮上限：一次扫描把一年的积压全读进内存没有意义 */
    private static final int BATCH_SIZE = 200;

    private final MeetingMinutesItemMapper itemMapper;
    private final MeetingMinutesItemOwnerMapper ownerMapper;
    private final MeetingMinutesMapper minutesMapper;
    private final SysUserMapper userMapper;
    private final NotificationAppService appService;
    private final DingTalkAppService dingTalkAppService;
    private final MeetingNotifyTemplateService templateService;

    /** 与补发作业共用开关：回滚时只改配置不改代码 */
    @Value("${meeting.job.enabled:true}")
    private boolean jobEnabled;

    @Scheduled(fixedDelayString = "${meeting.follow.scan-interval-ms:3600000}",
            initialDelayString = "${meeting.follow.initial-delay-ms:180000}")
    public void scan() {
        if (!jobEnabled) {
            return;
        }
        try {
            List<MeetingMinutesItem> due = itemMapper.findDueReminders(LocalDate.now(), BATCH_SIZE);
            if (due.isEmpty()) {
                return;
            }
            boolean switchedOn = templateService.enabled(MeetingConstants.SCENARIO_FOLLOW_OVERDUE,
                    SysNotificationSwitch.CHANNEL_WORK);
            NotificationAppService.Credentials app = switchedOn
                    ? appService.resolve(MeetingConstants.SCENARIO_FOLLOW_OVERDUE) : null;
            int sent = 0;
            int skipped = 0;
            for (MeetingMinutesItem item : due) {
                // 抢占：拿不到说明别的实例/上一轮已经处理过
                if (itemMapper.markNotified(item.getId(), LocalDateTime.now()) == 0) {
                    continue;
                }
                if (app == null) {
                    skipped++;
                    continue;
                }
                // 一条事项的负责人可以有多人：逾期了每个人都得知道，只追首负责人等于把协办排除在事实之外
                List<SysUser> owners = resolveOwners(item);
                if (owners.isEmpty()) {
                    skipped++;
                    continue;
                }
                for (SysUser owner : owners) {
                    if (send(item, owner, app)) {
                        sent++;
                    }
                }
            }
            log.info("跟進事項逾期提醒完成: 到期={} 已發={} 跳過={}（靜音/未綁定應用/負責人未綁钉钉）",
                    due.size(), sent, skipped);
        } catch (Exception e) {
            // 定时任务异常不能打断后续调度
            log.error("跟進事項逾期提醒作業失敗: {}", e.getMessage(), e);
        }
    }

    /**
     * 这条事项现在该催谁：取负责人真源表全量，再按钉钉绑定过滤。
     * <p>顺手把负责人装进事项对象，卡片里的「負責人」才能列出所有人而不是只有首负责人。
     * <p>真源表还没有行（没跑过 334 回填的库）时按事项行上的首负责人缓存处理——
     * 那个人确实被交办过，不能因为读不到新表就一个都不发。
     */
    private List<SysUser> resolveOwners(MeetingMinutesItem item) {
        List<MeetingMinutesItemOwner> rows = ownerMapper.findByItem(item.getId());
        item.setOwners(rows);
        Set<Long> ids = new LinkedHashSet<>();
        for (MeetingMinutesItemOwner row : rows) {
            if (row.getUserId() != null) {
                ids.add(row.getUserId());
            }
        }
        if (ids.isEmpty() && item.getOwnerUserId() != null) {
            ids.add(item.getOwnerUserId());
        }
        if (ids.isEmpty()) {
            return List.of();
        }
        return userMapper.selectBatchIds(ids).stream()
                .filter(user -> user != null && StringUtils.hasText(user.getDingtalkUserId()))
                .toList();
    }

    private boolean send(MeetingMinutesItem item, SysUser owner, NotificationAppService.Credentials app) {
        MeetingMinutes minutes = minutesMapper.selectById(item.getMinutesId());
        if (minutes == null) {
            return false;
        }
        long overdueDays = item.getDueDate() == null ? 0
                : Math.max(1, ChronoUnit.DAYS.between(item.getDueDate(), LocalDate.now()));
        String base = app.getBaseUrl();
        String viewUrl = StringUtils.hasText(base)
                ? trimSlash(base) + "/meeting-minutes?bookingId=" + minutes.getBookingId() : "";
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("itemContent", item.getContent());
        vars.put("meetingTitle", minutes.getMeetingTitle());
        vars.put("meetingTime", minutes.getMeetingTimeText());
        vars.put("dueDate", item.getDueDate() == null ? "" : item.getDueDate().toString());
        vars.put("overdueDays", String.valueOf(overdueDays));
        MeetingMinutesRenderer.OwnerDisplay display = MeetingMinutesRenderer.ownerDisplay(item);
        vars.put("ownerName", display.names());
        vars.put("ownerEmpNo", display.empNos());
        vars.put("viewUrl", viewUrl);
        MeetingNotifyTemplateService.Rendered rendered =
                templateService.render(MeetingConstants.SCENARIO_FOLLOW_OVERDUE, vars);
        String title = rendered != null ? rendered.title() : "【待辦逾期】" + item.getContent();
        String body = rendered != null ? rendered.body() : fallback(vars);
        try {
            Boolean accepted = dingTalkAppService.sendWorkNotification(MeetingConstants.SCENARIO_FOLLOW_OVERDUE,
                            app.getId(), List.of(owner.getDingtalkUserId()), title, body)
                    .get(15, TimeUnit.SECONDS);
            if (!Boolean.TRUE.equals(accepted)) {
                log.warn("跟進事項逾期提醒未被渠道受理: itemId={}", item.getId());
            }
            return Boolean.TRUE.equals(accepted);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } catch (Exception e) {
            log.warn("跟進事項逾期提醒發送失敗: itemId={}, type={}", item.getId(), e.getClass().getSimpleName());
            return false;
        }
    }

    private static String fallback(Map<String, String> vars) {
        return "**你有一項會議待辦已逾期**\n\n事項：**" + vars.get("itemContent") + "**\n\n"
                + "來源會議：" + vars.get("meetingTitle") + "（" + vars.get("meetingTime") + "）\n"
                + "完成時限：**" + vars.get("dueDate") + "**（已逾期 " + vars.get("overdueDays") + " 天）\n"
                + "負責人：👤 **" + vars.get("ownerName") + "（" + vars.get("ownerEmpNo") + "）**\n\n"
                + "請更新處理狀態；如已完成，請在紀要頁填寫處理結果。";
    }

    private static String trimSlash(String value) {
        String out = value.trim();
        while (out.endsWith("/") || out.endsWith("#")) {
            out = out.substring(0, out.length() - 1);
        }
        return out;
    }
}
