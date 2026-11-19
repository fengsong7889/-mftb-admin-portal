/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.contracts.rdm;

/**
 * RDM 交付侧对外暴露的「进度回写」端口，供持續績效（CPM）的关联条目使用。
 *
 * <p><b>为什么要有端口而不是让 CPM 直接 UPDATE {@code rdm_work_task}</b>：
 * RDM 的进度写入口 {@code RdmDeliveryService.updateTaskProgress} 上挂着六道护栏——
 * 可见性守卫、任务操作人守卫、{@code expectedProgress} 乐观锁、action 白名单、
 * PRD 任务 100% 只能走提交评审、完成/阻塞必须留下说明，外加进度审计流水与交付项阶段重算。
 * CPM 自己拼一条 UPDATE 等于把这六条全部绕开，后果不是「少校验」而是
 * 两套真值开始互相覆盖：甘特图与日报会与 CPM 记录长期不一致，而且没人能看出从哪一步开始飘的。
 *
 * <p>依赖方向与 {@link RdmWorkItemSource} 完全一致：{@code legacy -> contracts/rdm <- modules/rdm}。
 *
 * <p><b>刻意不传操作人身份</b>：实现方必须从当前请求的登录态取人
 * （同线程内 SecurityContext 就在），端口一旦接受 {@code operatorUserId}，
 * 就等于允许 CPM 替别人改交付进度——那正是要防住的那类伪造。
 */
public interface RdmTaskProgressSink {

    /**
     * 把 CPM 侧的一次进度/状态更新映射成 RDM 的一次上报动作。
     *
     * <p>语义是「尽力而为且结果如实回报」：实现方不得为了「看起来成功」而吞掉拒绝原因，
     * 调用方（CPM）也不得因为这里失败就回滚自己的工作记录——
     * 过程层事实不该被交付层规则拒绝掉，但两边是否一致必须让人看见。
     *
     * @param command 回写命令（任务 id、期望进度、目标进度/动作、说明）
     * @return 回写结果，含 RDM 侧当前进度（冲突时用于「重新对齐」）
     */
    SyncResult applyProgress(SyncCommand command);

    /**
     * 只读探测目标任务当前状态（阶段三「重新對齊」用）。
     *
     * <p>为什么必须单独给一个读方法：「重新對齊」的正确含义是<b>以交付侧真值刷新本地基准</b>，
     * 而不是「把我的值再推一次、这次不带期望值」。后者等于关掉乐观锁，
     * 端口一旦只提供写能力，调用方就只能选这条错路。
     *
     * @param taskId rdm_work_task.id
     * @return 探测结果；任务不存在时 {@code exists=false}
     */
    TaskSnapshot probe(long taskId);

    /**
     * @param exists   任务是否存在且未删除
     * @param progress RDM 当前进度
     * @param status   RDM 当前状态原始码（词表归 RDM 域）
     * @param prdTask  是否 PRD 类任务
     */
    record TaskSnapshot(boolean exists, Integer progress, String status, boolean prdTask) {

        public static TaskSnapshot missing() {
            return new TaskSnapshot(false, null, null, false);
        }
    }

    /**
     * @param taskId           目标 rdm_work_task.id
     * @param expectedProgress 上次已知的 RDM 进度；null 表示不校验（首次对齐）。
     *                         RDM 侧用它做乐观锁，缺值就只能静默覆盖他人上报
     * @param progress         目标进度 0-100；{@code action=done/block/unblock} 时可空
     * @param action           RDM 白名单动作：start / progress / done / block / unblock
     * @param remark           说明；RDM 要求完成必填交付说明、阻塞必填原因
     * @param sourceSystem     来源标识（固定 cpm），写进 RDM 进度流水便于两侧对账
     */
    record SyncCommand(
        long taskId,
        Integer expectedProgress,
        Integer progress,
        String action,
        String remark,
        String sourceSystem
    ) { }

    /**
     * @param state          success / conflict / rejected / unavailable，取值语义与
     *                       {@code biz_cpm_item.rdm_sync_state} 一一对应
     * @param message        给本人看的原文案（RDM 拒绝原因或冲突提示），不脱敏也不加戏
     * @param currentProgress RDM 侧当前进度：冲突时界面据此给出「以 X% 重新对齐」的出路
     */
    record SyncResult(
        boolean applied,
        String state,
        String message,
        Integer currentProgress
    ) {

        public static SyncResult success(String message, Integer currentProgress) {
            return new SyncResult(true, "success", message, currentProgress);
        }

        public static SyncResult of(String state, String message, Integer currentProgress) {
            return new SyncResult(false, state, message, currentProgress);
        }
    }
}
