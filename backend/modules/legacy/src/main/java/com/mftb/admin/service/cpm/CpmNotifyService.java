/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmPushRecord;
import com.mftb.admin.entity.CpmRecognition;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmPushRecordMapper;
import com.mftb.admin.mapper.CpmRecognitionMapper;
import com.mftb.admin.mapper.CpmReportMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DingTalkService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;

/**
 * 投递服务：发布送达、截止催办、认定通知三类事件统一出口。
 *
 * <p>三道闸顺序固定（任何一道挡下都留痕而不是静默）：
 * 1) dry-run（cpm.notify.dry-run，验收默认 true）→ 登记 skipped：验收要能证明「本该发给谁」；
 * 2) push_record claimSlot 抢占 → 同日同事件同接收人只有一条能进入发送；
 * 3) DingTalkService 按场景路由真实发送；异常标 failed 不重试刷屏——
 *    重发只补 failed 的语义留给手动触发入口，自动作业永不重发 sent。
 *
 * <p>正文纪律：卡片只含标题级摘要 + 站内链接，汇报正文一律站内鉴权后查看——
 * 钉钉消息会停留在聊天记录里，跨系统可见性不能靠一条推送泄露。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmNotifyService {

    /** 站内汇报详情路径（登录后按回执鉴权，不做免登令牌） */
    private static final String REPORT_PATH = "/cpm-report-detail?id=";

    private final CpmPushRecordMapper pushMapper;
    private final CpmReportMapper reportMapper;
    private final CpmRecognitionMapper recognitionMapper;
    private final SysUserMapper userMapper;
    private final CpmRuleService ruleService;
    private final DingTalkService dingTalkService;

    @Value("${cpm.notify.dry-run:true}")
    private boolean dryRun;

    @Value("${cpm.portal-base-url:}")
    private String portalBaseUrl;

    /** 发布送达：接收人=直属上级+追加名单；每人一条 push_record（幂等键含 report 行）。 */
    public void notifyReportPublished(long reportId) {
        CpmReport report = reportMapper.selectById(reportId);
        if (report == null || !CpmConstants.REPORT_STATUS_PUBLISHED.equals(report.getStatus())) {
            return;
        }
        List<Long> receivers = ruleService.resolveReceivers(report.getUserId());
        if (receivers.isEmpty()) {
            log.info("[CpmNotify] 匯報 {} 無配置接收人，僅站內可見", reportId);
            return;
        }
        SysUser owner = userMapper.selectById(report.getUserId());
        String ownerName = owner == null ? "成員" : owner.getName();
        CpmDto.Snapshot snapshot = com.mftb.admin.util.JsonUtils.parse(
                report.getContentJson(), CpmDto.Snapshot.class);
        String totalsText = snapshot == null || snapshot.getTotals() == null ? ""
                : String.format("完成 %d / 共 %d 項", snapshot.getTotals().getDone(), snapshot.getTotals().getTotal());
        for (Long receiverId : receivers) {
            int claimed = pushMapper.claimSlot(CpmConstants.SCENARIO_REPORT_PUBLISHED, receiverId,
                    report.getPeriodStart(), reportId);
            if (claimed == 0) {
                continue;
            }
            CpmPushRecord queued = findQueued(CpmConstants.SCENARIO_REPORT_PUBLISHED, receiverId, report.getPeriodStart());
            if (queued == null) {
                continue;
            }
            String title = "新的週期匯報：" + ownerName;
            String markdown = "### " + title + "\n\n"
                    + "- 週期：" + report.getPeriodStart() + " ~ " + report.getPeriodEnd() + "\n"
                    + "- 概覽：" + totalsText + "\n\n"
                    + linkLine(reportId);
            deliver(queued, title, markdown);
        }
    }

    /** 截止催办：发给未提交者本人（不发给上级群——催办是提醒不是通报，反内卷红线）。 */
    public void remindDeadline(long userId, LocalDate periodStart, String summaryText) {
        int claimed = pushMapper.claimSlot(CpmConstants.SCENARIO_REPORT_DEADLINE_REMIND, userId, periodStart, null);
        if (claimed == 0) {
            return;
        }
        CpmPushRecord queued = findQueued(CpmConstants.SCENARIO_REPORT_DEADLINE_REMIND, userId, periodStart);
        if (queued == null) {
            return;
        }
        String title = "本週匯報尚未發布";
        String markdown = "### " + title + "\n\n" + summaryText + "\n\n"
                + "[前往填寫工作記錄並發布匯報](" + baseUrl() + "/cpm-my)";
        deliver(queued, title, markdown);
    }

    /** 认定通知：发给被认定人（只通知本人，认定不公开广播——绩效证据的传播范围由本人控制）。 */
    public void notifyRecognition(long recognitionId) {
        CpmRecognition recognition = recognitionMapper.selectById(recognitionId);
        if (recognition == null || recognition.getToUserId() == null) {
            return;
        }
        LocalDate periodStart = LocalDate.now();
        int claimed = pushMapper.claimSlot(CpmConstants.SCENARIO_RECOGNITION_GRANTED, recognition.getToUserId(),
                periodStart, recognitionId);
        if (claimed == 0) {
            return;
        }
        CpmPushRecord queued = findQueued(CpmConstants.SCENARIO_RECOGNITION_GRANTED, recognition.getToUserId(), periodStart);
        if (queued == null) {
            return;
        }
        SysUser from = userMapper.selectById(recognition.getFromUserId());
        String title = "你收到了一項成果認定";
        String markdown = "### " + title + "\n\n"
                + "- 認定人：" + (from == null ? "上級" : from.getName()) + "\n"
                + "- 對象：" + safe(recognition.getTargetTitle()) + "\n"
                + "- 說明：" + safe(recognition.getComment()) + "\n\n"
                + "[查看個人成果檔案](" + baseUrl() + "/cpm-report)";
        deliver(queued, title, markdown);
    }

    /* ==================== 内部 ==================== */

    private void deliver(CpmPushRecord queued, String title, String markdown) {
        if (dryRun) {
            pushMapper.finishQueued(queued.getId(), CpmPushRecord.STATUS_SKIPPED, "dry-run");
            log.info("[CpmNotify] dry-run 跳過投遞 receiver={} event={} title={}",
                    queued.getUserId(), queued.getEventType(), title);
            return;
        }
        if (!ruleService.personalPushEnabled()) {
            pushMapper.finishQueued(queued.getId(), CpmPushRecord.STATUS_SKIPPED, "personal push off");
            return;
        }
        try {
            // 个人工作通知走钉钉渠道既有「按人」发送；异常只标 failed，不向调用方上抛
            SysUser receiver = userMapper.selectById(queued.getUserId());
            dingTalkService.sendMarkdown("cpm_report", title, markdown,
                    receiver == null ? List.of() : List.of(String.valueOf(receiver.getId())), false);
            pushMapper.finishQueued(queued.getId(), CpmPushRecord.STATUS_SENT, null);
        } catch (RuntimeException e) {
            log.warn("[CpmNotify] 投遞失敗 receiver={} event={}: {}",
                    queued.getUserId(), queued.getEventType(), e.getMessage());
            pushMapper.finishQueued(queued.getId(), CpmPushRecord.STATUS_FAILED, abbreviate(e.getMessage()));
        }
    }

    private CpmPushRecord findQueued(String eventType, long userId, LocalDate periodStart) {
        return pushMapper.selectOne(new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<CpmPushRecord>()
                .eq(CpmPushRecord::getEventType, eventType)
                .eq(CpmPushRecord::getUserId, userId)
                .eq(CpmPushRecord::getPeriodStart, periodStart)
                .eq(CpmPushRecord::getStatus, CpmPushRecord.STATUS_QUEUED)
                .orderByDesc(CpmPushRecord::getId)
                .last("LIMIT 1"));
    }

    private String linkLine(long reportId) {
        return "[查閱匯報全文（需登錄）](" + baseUrl() + REPORT_PATH + reportId + ")";
    }

    private String baseUrl() {
        return portalBaseUrl == null || portalBaseUrl.isBlank() ? "" : portalBaseUrl;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String abbreviate(String message) {
        if (message == null) {
            return "unknown";
        }
        return message.length() > 190 ? message.substring(0, 190) : message;
    }
}
