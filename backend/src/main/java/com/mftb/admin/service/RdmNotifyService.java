package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.SysUser;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.mapper.SysUserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * RDM 通知服务：统一走钉钉场景 {@code rdm}，并落 {@code rdm_notify_log} 留痕。
 * <p>通知失败只记录不抛出——业务流转已成立时，不能因为推送失败回滚需求状态；
 * 但「该发没发」必须可查（留痕含失败原因），避免漏通知无从排查。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmNotifyService {

    private final DingTalkService dingTalkService;
    private final SysUserMapper sysUserMapper;
    private final JdbcTemplate jdbcTemplate;

    /**
     * 按事件通知指定用户集合。
     * <p>事务内调用时延后到提交后发送，避免长事务持有连接等待外部 HTTP。
     *
     * @param eventCode  事件编码（RdmConstants.EVENT_*）
     * @param req        需求（用于标题与编号）
     * @param receivers  接收人（可为 null/空，此时仅群播报不 @ 人）
     * @param title      标题
     * @param text       Markdown 正文
     */
    public void notifyUsers(String eventCode, RdmRequirement req, Collection<SysUser> receivers,
                            String title, String text) {
        Set<String> mobiles = new LinkedHashSet<>();
        List<SysUser> users = receivers == null ? List.of() : new ArrayList<>(receivers);
        for (SysUser user : users) {
            if (user != null && StringUtils.hasText(user.getMobile())) {
                mobiles.add(user.getMobile());
            }
        }
        String scenario = RdmConstants.NOTIFY_SCENARIO;
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    doSend(eventCode, req, scenario, title, text, new ArrayList<>(mobiles), users);
                }
            });
        } else {
            doSend(eventCode, req, scenario, title, text, new ArrayList<>(mobiles), users);
        }
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

    private void doSend(String eventCode, RdmRequirement req, String scenario, String title,
                        String text, List<String> atMobiles, List<SysUser> receivers) {
        String status = "skipped";
        String error = null;
        try {
            if (!StringUtils.hasText(text)) {
                status = "skipped";
            } else {
                dingTalkService.sendMarkdown(scenario, title, text, atMobiles, false);
                status = "success";
            }
        } catch (Exception e) {
            // 推送失败不回滚业务：记录失败原因，由留痕表支撑补发
            status = "failed";
            error = e.getMessage();
            log.warn("RDM 钉钉通知发送失败: event={}, req={}, error={}", eventCode,
                    req != null ? req.getReqNo() : null, e.getMessage());
        }
        writeLog(eventCode, req, status, receivers, error);
    }

    /** 通知留痕（无接收人时记一行群体播报，保证事件可追溯） */
    private void writeLog(String eventCode, RdmRequirement req, String status,
                          List<SysUser> receivers, String error) {
        Long reqId = req != null ? req.getId() : null;
        String truncated = error != null && error.length() > 500 ? error.substring(0, 500) : error;
        if (receivers == null || receivers.isEmpty()) {
            insertLog(reqId, eventCode, null, null, status, truncated);
            return;
        }
        for (SysUser user : receivers) {
            if (user == null) {
                continue;
            }
            insertLog(reqId, eventCode, user.getName(), user.getEmpId(), status, truncated);
        }
    }

    private void insertLog(Long reqId, String eventCode, String receiverName, String receiverEmpNo,
                           String status, String error) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO rdm_notify_log (req_id, event_code, channel, receiver_name, receiver_emp_no, send_status, error_msg) "
                            + "VALUES (?, ?, 'DINGTALK', ?, ?, ?, ?)",
                    reqId, eventCode, receiverName, receiverEmpNo, status, error);
        } catch (Exception e) {
            // 留痕失败不影响通知本身，仅告警（表结构异常时下一次启动的契约校验会暴露）
            log.warn("RDM 通知留痕写入失败: event={}, error={}", eventCode, e.getMessage());
        }
    }
}
