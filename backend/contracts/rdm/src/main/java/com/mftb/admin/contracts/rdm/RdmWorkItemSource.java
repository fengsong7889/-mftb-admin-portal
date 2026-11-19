/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.contracts.rdm;

import java.time.LocalDate;
import java.util.List;

/**
 * 產研交付（RDM）对外暴露的「本人相关工作项」只读契约，供持續績效（CPM）关联导入使用。
 *
 * <p>为什么走契约而不是直接注入 RDM 服务：legacy 与 modules/rdm 之间只允许
 * {@code legacy -> contracts/rdm <- modules/rdm} 的单向依赖（见 {@link RdmProjectVisibility}
 * 同款论证）。CPM 需要把「我提的/我负责的/我验收的需求」一键带成工作记录条目，
 * 但「与某人相关」的判定涉及 RDM 的六个角色列与参与者表，口径必须留在 RDM 域内维护，
 * 否则 RDM 加一个角色列，CPM 这边就会静默漏数据。
 *
 * <p>返回的是扁平引用对象而不是 RdmRequirement 实体：契约一旦暴露领域模型，
 * 调用方就会开始依赖 RDM 的列名，跨域解耦白做。
 */
public interface RdmWorkItemSource {

    /**
     * 查询与指定员工相关、且尚未结案的需求（按最近变动排序）。
     *
     * @param userId  目标员工 sys_user.id（由调用方从登录态取，不接受前端传值）
     * @param keyword 标题/需求编号模糊匹配，可为空
     * @param limit   返回上限（调用方负责传入合理值，实现侧不得无视）
     * @return 需求引用列表；无匹配时返回空列表，不抛异常
     */
    List<WorkItemRef> findRelatedOpenRequirements(long userId, String keyword, int limit);

    /**
     * 需求引用：CPM 条目只需要「认得出是哪件事 + 当前到哪一步」。
     *
     * @param reqId      rdm_requirement.id，作为 CPM 条目的 source_ref 落库
     * @param reqNo      需求编号（展示用，可空）
     * @param title      需求标题（直接作为 CPM 条目标题的默认值）
     * @param status     需求状态原始码（rdm_requirement.status），前端用 RDM 词表翻译
     * @param progress   需求进度百分比 0-100，可空（RDM 未填时 CPM 不自造数字）
     * @param myRole     本人所乘角色：submitter/pm/dev/accept/participant
     * @param planDate   计划发布日（可空），用于展示截止参考
     * @param terminated 是否已进入结案态（released/verified），结案项允许导入但需提示
     */
    record WorkItemRef(
        Long reqId,
        String reqNo,
        String title,
        String status,
        Integer progress,
        String myRole,
        LocalDate planDate,
        boolean terminated
    ) { }

    /**
     * 任务引用（阶段三）：CPM 的进度回写只能落到任务级，所以关联清单必须能给出任务。
     *
     * <p>{@code prdTask} 必须暴露：PRD 类任务的 100% 在 RDM 侧只能通过「提交評審」达成，
     * 端口不把这个事实传出去，CPM 就无法预先拒绝一类注定被回写拒绝的操作。
     *
     * @param taskId          rdm_work_task.id，作为 CPM 条目的 source_ref 落库
     * @param taskNo          任务编号（展示与回写留痕用）
     * @param reqId           所属需求 id（界面副行素材）
     * @param reqTitle        所属需求标题
     * @param title           任务标题
     * @param status          任务状态原始码，词表归 RDM 域
     * @param progress        RDM 当前进度 0-100（同时作为回写的 expectedProgress 基准）
     * @param planHours       计划工时（展示素材；CPM 不自建工时估算口径）
     * @param myRole          owner=我是负责人 / participant=我参与
     * @param planFinishDate  计划完成日，可空
     * @param prdTask         是否 PRD 类任务（100% 需走提交评审）
     * @param terminated      是否已结案（done/cancelled/released），允许导入但界面要提示
     */
    record TaskRef(
        Long taskId,
        String taskNo,
        Long reqId,
        String reqTitle,
        String title,
        String status,
        Integer progress,
        java.math.BigDecimal planHours,
        String myRole,
        LocalDate planFinishDate,
        boolean prdTask,
        boolean terminated
    ) { }

    /**
     * 查询与指定员工相关、且尚未结案的<b>任务</b>（按截止日与最近变动排序）。
     *
     * <p>口径必须由 RDM 域自己给：「与我相关」在这边是 owner_user_id 命中
     * 或 role 表/参与者表命中，与需求级的五类角色列不是同一套判定，CPM 抄一遍必然抄漏。
     *
     * @param userId  目标员工 sys_user.id（由调用方从登录态取，不接受前端传值）
     * @param keyword 标题/任务号模糊匹配，可为空
     * @param limit   返回上限（调用方负责传入合理值，实现侧不得无视）
     * @return 任务引用列表；无匹配时返回空列表，不抛异常
     */
    List<TaskRef> findMyOpenTasks(long userId, String keyword, int limit);
}
