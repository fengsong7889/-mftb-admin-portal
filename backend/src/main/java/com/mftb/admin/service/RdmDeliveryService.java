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

    /** 新增/编辑任务 */
    RdmDeliveryVO.Task saveTask(RdmDeliveryDTO.Task dto);

    /** 上报任务进度/工时（start/done/block/unblock），并联动需求状态 */
    RdmDeliveryVO.Task updateTaskProgress(Long id, RdmDeliveryDTO.TaskProgress dto);

    /** 删除任务（已完成的不允许删，避免工时被抹） */
    void deleteTask(Long id);

    /** 需求交付概览：PRD + 任务 + 评审 + 变更 + 工时汇总 */
    RdmDeliveryVO.DeliverySummary summary(Long reqId);

    /* ── 迭代排期 ── */

    /** 迭代列表（含产能与已排入量） */
    List<RdmDeliveryVO.Iteration> listIterations();

    /** 新增/编辑迭代 */
    RdmDeliveryVO.Iteration saveIteration(RdmDeliveryDTO.Iteration dto);

    /* ── 需求变更 ── */

    /** 需求下的变更记录 */
    List<RdmDeliveryVO.Change> listChanges(Long reqId);

    /** 发起变更申请（走 OA 审批） */
    RdmDeliveryVO.Change applyChange(RdmDeliveryDTO.Change dto);
}
