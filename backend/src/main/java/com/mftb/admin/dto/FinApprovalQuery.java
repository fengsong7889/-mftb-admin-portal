package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 审批流程列表查询条件（审批中心菜单搜索区）
 */
@Getter
@Setter
public class FinApprovalQuery extends FinPageQuery {

    /** 集团ID（模糊匹配） */
    private String groupId;

    /** 集团名称（模糊匹配） */
    private String groupName;

    /** 所属品牌 */
    private String brand;

    /** 流程编号（模糊匹配） */
    private String flowNo;

    /** 审批类型: recharge / transfer / deduct / merge */
    private String approvalType;

    /** 申请人（模糊匹配） */
    private String applicant;

    /** 流程状态: pending / approved / rejected / cancelled */
    private String flowStatus;

    /** 当前待审节点: business / operation / finance（仅对审批中的流程生效） */
    private String currentNode;

    /** 审批人（三个节点任一匹配即可，模糊匹配） */
    private String approver;

    /** 申请时间-开始日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate applyFrom;

    /** 申请时间-结束日期 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate applyTo;

    public LocalDateTime applyFromTime() {
        return startOf(applyFrom);
    }

    public LocalDateTime applyToTime() {
        return endExclusive(applyTo);
    }
}
