package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * RDM 通知服务：业务事务内<b>只登记投递任务</b>（rdm_notify_log，一条事件一行），
 * 提交后交给 {@link RdmNotifyDispatcher} 异步发送，并按渠道返回结果落状态。
 *
 * <p>为什么不在事务里直接发：外部 HTTP 会把数据库连接和事务一起拖长。
 * <p>为什么不能「调用完就算成功」：原实现调用 {@code @Async void sendMarkdown} 一返回就记 success，
 * 而 SLA 提醒用 success 做 24 小时去重——渠道没受理的提醒会被自己那条 success 抑制一整天，
 * 越该催的越安静。现在 sent 只代表渠道已受理，未受理一律进入退避重试。
 * <p>通知失败永不回滚业务：需求流转已经成立，不能因为推送失败退回上一步。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmNotifyService {

    private final RdmNotifyDispatcher dispatcher;
    private final SysUserMapper sysUserMapper;
    private final JdbcTemplate jdbcTemplate;

    /**
     * 按事件通知一组接收人（一条群播报消息 @多人，因此一条事件只登记一行）。
     *
     * @param eventCode 事件编码（RdmConstants.EVENT_*）
     * @param req       需求（用于追溯与页面跳转）
     * @param receivers 接收人，可为空（只群播报不 @ 人）
     * @param title     标题
     * @param text      Markdown 正文
     */
    public void notifyUsers(String eventCode, RdmRequirement req, Collection<SysUser> receivers,
                            String title, String text) {
        Set<String> mobiles = new LinkedHashSet<>();
        Set<String> names = new LinkedHashSet<>();
        for (SysUser user : receivers == null ? List.<SysUser>of() : receivers) {
            if (user == null) {
                continue;
            }
            if (StringUtils.hasText(user.getMobile())) {
                mobiles.add(user.getMobile());
            }
            if (StringUtils.hasText(user.getName())) {
                names.add(user.getName());
            }
        }
        enqueue(eventCode, req, RdmConstants.NOTIFY_SCENARIO, title, text,
                new ArrayList<>(mobiles), new ArrayList<>(names));
    }

    /** 按用户ID集合通知 */
    public void notifyUserIds(String eventCode, RdmRequirement req, Collection<Long> userIds,
                              String title, String text) {
        if (userIds == null || userIds.isEmpty()) {
            notifyUsers(eventCode, req, List.of(), title, text);
            return;
        }
        Set<Long> ids = new LinkedHashSet<>(userIds);
        ids.remove(null);
        if (ids.isEmpty()) {
            return;
        }
        List<SysUser> users = sysUserMapper.selectList(
                new LambdaQueryWrapper<SysUser>().in(SysUser::getId, ids));
        notifyUsers(eventCode, req, users, title, text);
    }

    private void enqueue(String eventCode, RdmRequirement req, String scenario, String title,
                         String text, List<String> atMobiles, List<String> receiverNames) {
        boolean blank = !StringUtils.hasText(text);
        Long id = insertTask(eventCode, req, scenario, title, text, atMobiles, receiverNames,
                blank ? "skipped" : "pending", blank ? null : "消息为空，按规则未发送");
        if (blank || id == null) {
            return;
        }
        // 事务内登记、提交后再发：回滚的需求不该发出「已进入需求池」这种通知
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatcher.dispatch(id);
                }
            });
        } else {
            dispatcher.dispatch(id);
        }
    }

    /**
     * 登记投递任务。
     * <p>写入失败（例如旧库尚未跑完 2C 迁移）不能让业务回滚，也不能静默丢通知：
     * 记 error 日志并退化为「直接尝试发送一次」，至少保留一次送达机会与排查线索。
     */
    private Long insertTask(String eventCode, RdmRequirement req, String scenario, String title,
                            String text, List<String> atMobiles, List<String> receiverNames,
                            String status, String error) {
        String sql = "INSERT INTO rdm_notify_log (req_id, event_code, channel, scenario, title, content, "
                + "at_mobiles, receivers, send_status, attempts, next_retry_at, error_msg, deleted) "
                + "VALUES (?, ?, 'DINGTALK', ?, ?, ?, ?, ?, ?, 0, "
                + ("pending".equals(status) ? "now()" : "NULL") + ", ?, 0)";
        try {
            KeyHolder keyHolder = new GeneratedKeyHolder();
            jdbcTemplate.update(connection -> {
                PreparedStatement ps = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
                int idx = 1;
                ps.setObject(idx++, req == null ? null : req.getId());
                ps.setString(idx++, eventCode);
                ps.setString(idx++, scenario);
                ps.setString(idx++, truncate(title, 200));
                ps.setString(idx++, text);
                ps.setString(idx++, join(atMobiles));
                ps.setString(idx++, join(receiverNames));
                ps.setString(idx++, status);
                ps.setString(idx, error);
                return ps;
            }, keyHolder);
            Number key = keyHolder.getKey();
            return key == null ? null : key.longValue();
        } catch (RuntimeException e) {
            log.error("RDM 通知任務登記失敗，退化為即時嘗試發送一次: event={}, req={}, error={}",
                    eventCode, req != null ? req.getReqNo() : null, e.getMessage());
            if ("pending".equals(status)) {
                dispatcher.sendOnce(eventCode, scenario, title, text, atMobiles);
            }
            return null;
        }
    }

    private static String join(List<String> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        return truncate(values.stream().filter(StringUtils::hasText).collect(Collectors.joining(",")), 512);
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
