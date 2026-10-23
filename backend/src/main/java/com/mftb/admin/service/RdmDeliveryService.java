package com.mftb.admin.service;

import com.mftb.admin.dto.RdmDeliveryDTO;
import com.mftb.admin.dto.RdmDeliveryVO;

import java.util.List;

/**
 * RDM 交付过程服务（M2）：PRD 拆解、评审、执行任务与工时、迭代排期、需求变更。
 * <p>与 {@link RdmRequirementService} 的边界：本服务只负责"过程产物"，
 * 需求主状态的推进一律回调需求服务，由 {@code rdm_transition} 配置判定能不能推、
 * 谁能推、必填什么 —— 交付过程不在代码里另写一套状态机。
 */
public interface RdmDeliveryService {

    /* ── PRD ── */

    /** 需求下的 PRD 列表 */
    List<RdmDeliveryVO.Prd> listPrds(Long reqId);

    /** 新增/编辑 PRD */
    RdmDeliveryVO.Prd savePrd(RdmDeliveryDTO.Prd dto);

    /** 删除 PRD（仅草稿可删） */
    void deletePrd(Long id);

    /* ── 评审 ── */

    /** 需求下的评审记录 */
    List<RdmDeliveryVO.Review> listReviews(Long reqId);

    /** 发起评审（联动需求进入「評審中」） */
    RdmDeliveryVO.Review createReview(RdmDeliveryDTO.Review dto);

    /** 录入评审结论（通过→评审通过；退回→回到 PRD 设计中） */
    RdmDeliveryVO.Review decideReview(Long id, RdmDeliveryDTO.ReviewDecision dto);

    /* ── 执行任务与工时 ── */

    /** 需求下的任务列表 */
    List<RdmDeliveryVO.Task> listTasks(Long reqId);

    /** 我的任务（研发/设计/测试人员视角） */
    List<RdmDeliveryVO.Task> myTasks(String status);

    /**
     * 指定成员的任务（团队协作视图：同项目对接、联调时查看对方进度）。
     * <p>数据范围由 {@code RdmTeamScopeService} 收敛：只有与目标同属至少一个在途项目
     * 才可见，且只返回共同项目下的任务；{@code canSeeAll}（管理员/PMO）不受项目限制。
     * <p>{@code ownerUserId} 为空或等于当前人时，等价于 {@link #myTasks(String)}。
     */
    List<RdmDeliveryVO.Task> teamTasks(Long ownerUserId, String status);

    /** 新增/编辑任务 */
    RdmDeliveryVO.Task saveTask(RdmDeliveryDTO.Task dto);

    /**
     * 从团队负载页把任务指派给某人（仅换负责人）。
     * <p>权限与 {@code saveTask}「指派/維護任務」同源（{@code requireDeliveryWriter}）；
     * 并发以 {@code expectedPlanVersion} 作乐观锁条件（不一致则 {@code CONFLICT}）。
     * 幂等由调用方（负载服务 {@code executeOnce}）包裹，本方法不自带幂等。
     */
    RdmDeliveryVO.Task assignTaskOwner(Long taskId, Long ownerUserId, Integer expectedPlanVersion);

    /**
     * 任务负责人资格预检（选人时即时提醒用）。
     * <p>不抛异常、只回结果：无研发交付权限属于「可以派活、随后补权限」，
     * 保存时也只记日志不阻断。
     */
    RdmDeliveryVO.OwnerCheck checkTaskOwner(Long userId);

    /** 上报任务进度/工时（start/done/block/unblock），并联动需求状态 */
    RdmDeliveryVO.Task updateTaskProgress(Long id, RdmDeliveryDTO.TaskProgress dto);

    /** 删除任务（已完成的不允许删，避免工时被抹） */
    void deleteTask(Long id);

    /** 需求交付概览：PRD + 任务 + 评审 + 变更 + 工时汇总 */
    RdmDeliveryVO.DeliverySummary summary(Long reqId);

    /* ── 迭代排期 ── */

    /** 迭代列表（含产能与已排入量） */
    List<RdmDeliveryVO.Iteration> listIterations();

    /**
     * 迭代候选搜索（远程搜索下拉用）。
     *
     * @param keyword   匹配迭代编码/名称，或所属项目编号/名称；为空时不限关键词
     * @param projectId 限定所属项目；非空时同时包含未挂项目的迭代（紧急修复）
     * @param limit     返回上限（1~200）；为空时带关键词默认 20、无关键词默认 100
     */
    List<RdmDeliveryVO.Iteration> listIterations(String keyword, Long projectId, Integer limit);

    /** 新增/编辑迭代 */
    RdmDeliveryVO.Iteration saveIteration(RdmDeliveryDTO.Iteration dto);

    /** 列表直改迭代状态（只更新状态与操作人，不回写其它字段） */
    void updateIterationStatus(Long id, String status);

    /** 删除迭代（逻辑删；迭代下仍有需求或任务时拒绝） */
    void deleteIteration(Long id);

    /* ── 需求变更 ── */

    /** 需求下的变更记录 */
    List<RdmDeliveryVO.Change> listChanges(Long reqId);

    /** 发起变更申请（走 OA 审批） */
    RdmDeliveryVO.Change applyChange(RdmDeliveryDTO.Change dto);

    /* ── 阶段 3：里程碑计划与工时明细 ── */

    /** 五节点计划（初步/基线/预测/实际） */
    List<RdmDeliveryVO.Milestone> milestones(Long reqId);

    /**
     * 保存初步计划或调整预测。
     * <p>基线一旦冻结就不允许再改 preliminary/baseline，只能改 forecast；
     * 否则按时率会变成「自己改考卷自己得高分」。
     */
    List<RdmDeliveryVO.Milestone> saveMilestones(Long reqId, List<RdmDeliveryDTO.Milestone> list);

    /** 冻结基线（评审通过、各角色估时确认后执行） */
    List<RdmDeliveryVO.Milestone> freezeMilestoneBaseline(Long reqId);

    /** 填报工时明细：只允许任务负责人本人，任务上的实际工时是本表汇总 */
    List<RdmDeliveryVO.WorkLog> saveWorkLogs(Long taskId, List<RdmDeliveryDTO.WorkLog> logs);

    /** PRD 定稿快照（版本链） */
    List<RdmDeliveryVO.PrdSnapshot> prdSnapshots(Long prdId);
}
