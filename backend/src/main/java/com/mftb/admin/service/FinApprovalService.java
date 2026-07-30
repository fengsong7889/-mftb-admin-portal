package com.mftb.admin.service;

import com.mftb.admin.dto.ApproveResultVO;
import com.mftb.admin.dto.DeductApplyDTO;
import com.mftb.admin.dto.FinApprovalQuery;
import com.mftb.admin.dto.FinApprovalVO;
import com.mftb.admin.dto.MergeApplyDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RechargeApplyDTO;
import com.mftb.admin.dto.TransferApplyDTO;

/**
 * 财务审批流程服务（申请提交 + 三级审批流转）
 */
public interface FinApprovalService {

    /** 审批中心分页查询 */
    PageResult<FinApprovalVO> page(FinApprovalQuery query);

    /** 审批详情 */
    FinApprovalVO detail(String flowNo);

    /** 提交推广金充值申请，返回流程编号 */
    String submitRecharge(RechargeApplyDTO request);

    /** 提交推广金转账申请，返回流程编号 */
    String submitTransfer(TransferApplyDTO request);

    /** 提交推广金扣款申请，返回流程编号 */
    String submitDeduct(DeductApplyDTO request);

    /** 提交商户合并申请，返回流程编号 */
    String submitMerge(MergeApplyDTO request);

    /** 通过当前待审节点（财务节点通过后同事务写入批次/明细/欠款/余额） */
    ApproveResultVO approve(String flowNo);

    /** 驳回当前待审节点，返回被驳回的节点名称 */
    String reject(String flowNo, String reason);

    /** 撤销申请（仅审批中流程可撤销） */
    void cancel(String flowNo);
}
