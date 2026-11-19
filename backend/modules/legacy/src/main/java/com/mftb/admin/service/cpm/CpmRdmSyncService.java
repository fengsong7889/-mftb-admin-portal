/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.contracts.rdm.RdmTaskProgressSink;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * RDM 进度回写（阶段三）。
 *
 * <p><b>整体姿态是「尽力而为 + 结果如实回显」，不是「一起成功或一起失败」</b>：
 * CPM 记的是过程层事实，RDM 是交付真值。让 CPM 因为 RDM 的规则（PRD 只能走提交评审、
 * 完成必须填交付说明）而保存失败，等于告诉用户「你不敢记」；但回写失败静默吞掉更糟——
 * 那会让人以为甘特图和自己的记录一致。所以写入照常成功，结果落在条目四列上，界面必须给原因。
 *
 * <p><b>映射表（与方案 §已定版决策 4 一一对应）</b>：
 * <table border="1">
 *   <caption>CPM 状态/进度 → RDM action</caption>
 *   <tr><th>CPM 事件</th><th>RDM action</th><th>不满足时</th></tr>
 *   <tr><td>progress 1..99（todo/doing）</td><td>progress</td><td>被 RDM 拒绝则原样回显</td></tr>
 *   <tr><td>doing 且 progress 0</td><td>start</td><td>—</td></tr>
 *   <tr><td>blocked → doing</td><td>unblock</td><td>—</td></tr>
 *   <tr><td>done（100）</td><td>done</td><td>缺交付说明 → rejected，<b>不降级成 99%</b></td></tr>
 *   <tr><td>blocked</td><td>block</td><td>缺原因 → rejected</td></tr>
 *   <tr><td>cancelled / deferred</td><td>不回写</td><td>rejected：RDM 无对应语义</td></tr>
 *   <tr><td>PRD 任务 ≥100</td><td>不回写</td><td>rejected：只能走提交评审</td></tr>
 * </table>
 *
 * <p>把 done 偷偷写成 99% 来「绕过」说明必填是最诱人的错法——它让回写看起来成功了，
 * 代价是 RDM 侧永远不会长出完成状态与交付说明，两边从此长期不一致且无人察觉。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmRdmSyncService {

    /** RDM 白名单动作（词表归 RDM 域，这里只引用字符串常量而不 import 其私有常量） */
    private static final String ACTION_START = "start";
    private static final String ACTION_PROGRESS = "progress";
    private static final String ACTION_DONE = "done";
    private static final String ACTION_BLOCK = "block";
    private static final String ACTION_UNBLOCK = "unblock";

    /**
     * 回写总闸（方案 §回滚）。默认 <b>false</b>：
     * 新功能第一次上线就去改别人的交付真值是不负责任的，必须先由运维显式打开。
     * 关掉时本服务一句都不写，条目状态列保持原样，CPM 记录不受任何影响。
     */
    @Value("${cpm.rdm-sync-enabled:false}")
    private boolean syncGloballyEnabled;

    private final CpmItemMapper itemMapper;
    /**
     * 端口用 {@link ObjectProvider} 而不是直接注入：RDM 模块缺席时（拆分部署/单模块启动）
     * 必须 fail-closed 给出「RDM 域不可用」，而不是让 CPM 的进度入口整个起不来。
     */
    private final ObjectProvider<RdmTaskProgressSink> sinkProvider;

    /** 本条目是否具备回写条件（界面据此决定要不要显示徽标与开关）。 */
    public boolean syncable(CpmItem item) {
        return item.getRdmTaskId() != null;
    }

    /** 总闸状态回给界面：关闭时徽标要说「系统未开启回写」而不是「同步失败」。 */
    public boolean isGloballyEnabled() {
        return syncGloballyEnabled;
    }

    /**
     * 进度写入之后的一次回写。
     *
     * @param item    已取到且已校验归属的条目（含回写前的 status，用来区分 unblock 与 progress）
     * @param status  本次写入后的条目状态
     * @param progress 本次写入后的进度（done 已由条目服务归一到 100）
     * @param note    本次进度说明，RDM 的交付说明/阻塞原因就取它
     */
    public CpmDto.RdmSyncVO syncAfterProgress(CpmItem item, String status, int progress, String note, SysUser current) {
        if (!syncable(item)) {
            // 需求级/手工/会议来源没有可写的交付对象：返回 null，界面连徽标都不出
            return null;
        }
        if (!Integer.valueOf(1).equals(item.getRdmSyncEnabled())) {
            return vo(false, CpmConstants.SYNC_PENDING, "已關閉回寫，本次更動只留在持續績效", item.getRdmTaskId(), null);
        }
        if (!syncGloballyEnabled) {
            return vo(true, CpmConstants.SYNC_PENDING, "系統未開啟 RDM 回寫（cpm.rdm-sync-enabled=false）", item.getRdmTaskId(), null);
        }
        RdmTaskProgressSink sink = sinkProvider.getIfAvailable();
        if (sink == null) {
            return record(item, current, CpmConstants.SYNC_REJECTED, "RDM 域不可用，未回寫", null);
        }

        String preStatus = item.getStatus();
        String action;
        if (CpmConstants.STATUS_CANCELLED.equals(status) || CpmConstants.STATUS_DEFERRED.equals(status)) {
            return record(item, current, CpmConstants.SYNC_REJECTED,
                    "已取消／延期屬個人過程判斷，不寫入交付真值", null);
        }
        if (CpmConstants.STATUS_DONE.equals(status)) {
            action = ACTION_DONE;
            if (!hasText(note)) {
                return record(item, current, CpmConstants.SYNC_REJECTED,
                        "完成任務必須填寫交付說明，請補一句說明後重新對齊", null);
            }
        } else if (CpmConstants.STATUS_BLOCKED.equals(status)) {
            action = ACTION_BLOCK;
            if (!hasText(note)) {
                return record(item, current, CpmConstants.SYNC_REJECTED,
                        "標記阻塞必須填寫阻塞原因", null);
            }
        } else if (CpmConstants.STATUS_DOING.equals(status) && CpmConstants.STATUS_BLOCKED.equals(preStatus)) {
            action = ACTION_UNBLOCK;
        } else if (CpmConstants.STATUS_DOING.equals(status) && progress <= 0) {
            action = ACTION_START;
        } else {
            action = ACTION_PROGRESS;
        }

        RdmTaskProgressSink.SyncCommand command = new RdmTaskProgressSink.SyncCommand(
                item.getRdmTaskId(), item.getRdmProgressSeen(), progress, action,
                hasText(note) ? note.trim() : null, CpmConstants.SYNC_SOURCE);
        RdmTaskProgressSink.SyncResult result;
        try {
            result = sink.applyProgress(command);
        } catch (RuntimeException e) {
            // 只记日志不冒抛：回写侧的任何故障都不该让本人的工作记录写不进去。
            // 异常原文不外泄给界面（可能含 SQL/内部路径），界面只拿「回寫異常，請聯繫管理員」
            log.warn("CPM 回寫 RDM 任務异常: itemId={} taskId={} err={}", item.getId(), item.getRdmTaskId(), e.toString());
            return record(item, current, CpmConstants.SYNC_ERROR, "回寫異常，請稍後重新對齊或聯繫管理員", null);
        }
        return record(item, current, result.state(), result.message(), result.currentProgress());
    }

    /**
     * 重新对齐：以 RDM 当前值刷新本地基准（{@code rdm_progress_seen}），<b>不</b>推送本地值。
     *
     * <p>这是冲突唯一正确的出路。用「这次不带 expectedProgress 再推一次」来实现同名按钮，
     * 等于把 RDM 的乐观锁关掉，别人的上报会被静默顶掉。
     */
    public CpmDto.RdmSyncVO realign(long itemId, SysUser current) {
        CpmItem item = itemMapper.selectAliveById(itemId);
        if (item == null || !Long.valueOf(current.getId()).equals(item.getUserId())) {
            throw new com.mftb.admin.common.BusinessException("記錄不存在或無權限");
        }
        if (!syncable(item)) {
            throw new com.mftb.admin.common.BusinessException("該記錄未關聯 RDM 任務，無需對齊");
        }
        RdmTaskProgressSink sink = sinkProvider.getIfAvailable();
        if (sink == null) {
            return record(item, current, CpmConstants.SYNC_REJECTED, "RDM 域不可用，無法對齊", null);
        }
        RdmTaskProgressSink.TaskSnapshot snapshot = sink.probe(item.getRdmTaskId());
        if (!snapshot.exists()) {
            return record(item, current, CpmConstants.SYNC_REJECTED, "RDM 任務不存在或已刪除，無法對齊", null);
        }
        return record(item, current, CpmConstants.SYNC_SUCCESS,
                "已以 RDM 當前 " + snapshot.progress() + "% 為準對齊本地基準", snapshot.progress());
    }

    /** 开关切换：关掉只影响后续是否推送，已落的 taskId 保留，重新打开即可继续对齐。 */
    public void setEnabled(long itemId, boolean enabled, SysUser current) {
        itemMapper.updateRdmSyncEnabled(itemId, current.getId(), enabled ? 1 : 0, current.getName());
    }

    /* ==================== 内部 ==================== */

    /** 结果落列 + 组装回显 VO：一次写入同时刷新 rdm_progress_seen，冲突判定才有基准。 */
    private CpmDto.RdmSyncVO record(CpmItem item, SysUser current, String state, String message, Integer rdmProgress) {
        Integer seen = rdmProgress != null ? rdmProgress : item.getRdmProgressSeen();
        String safeMessage = truncate(message);
        itemMapper.updateRdmSyncResult(item.getId(), current.getId(), state, safeMessage, seen, current.getName());
        return vo(true, state, safeMessage, item.getRdmTaskId(), seen);
    }

    private static CpmDto.RdmSyncVO vo(boolean enabled, String state, String message, Long taskId, Integer rdmProgress) {
        CpmDto.RdmSyncVO sync = new CpmDto.RdmSyncVO();
        sync.setEnabled(enabled);
        sync.setState(state);
        sync.setMessage(message);
        sync.setTaskId(taskId);
        sync.setRdmProgress(rdmProgress);
        // 只有真的同步成功才给时间戳：pending/rejected 显示一个「最近时间」会让人以为已经推过去了
        sync.setSyncedAt(CpmConstants.SYNC_SUCCESS.equals(state)
                ? java.time.LocalDateTime.now().withNano(0).toString().replace('T', ' ')
                : null);
        return sync;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    /** 列宽 200：RDM 的拒绝理由可能很长（带字段名），截断而不是让写库报 1406。 */
    private static String truncate(String message) {
        if (message == null) {
            return null;
        }
        String text = message.trim();
        return text.length() <= CpmConstants.SYNC_MESSAGE_MAX ? text : text.substring(0, CpmConstants.SYNC_MESSAGE_MAX);
    }
}
