package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 财务审批流程实体（三级审批: 业务主管 -> 运营主管 -> 财务主管）
 */
@Data
@TableName("biz_fin_approval")
public class FinApproval {

    @TableId
    private Long id;

    /** 流程编号: CZ=充值 KK=扣款 ZZ=转账 HB=合并 + 年月日 + 4位自增 */
    private String flowNo;

    /** 审批类型: recharge / transfer / deduct / merge */
    private String approvalType;

    /** 申请集团ID */
    private String groupCode;

    /** 申请集团名称 */
    private String groupName;

    /** 所属品牌 */
    private String brand;

    /** 申请人: 姓名(工号) */
    private String applicant;

    /** 申请时间 */
    private LocalDateTime applyTime;

    /** 业务主管审批人 */
    private String bizApprover;

    /** 业务主管审批时间 */
    private LocalDateTime bizApproveTime;

    /** 业务主管审批状态: pending / approved / rejected */
    private String bizApproveStatus;

    /** 运营主管审批人 */
    private String opsApprover;

    /** 运营主管审批时间 */
    private LocalDateTime opsApproveTime;

    /** 运营主管审批状态 */
    private String opsApproveStatus;

    /** 财务主管审批人 */
    private String finApprover;

    /** 财务主管审批时间 */
    private LocalDateTime finApproveTime;

    /** 财务主管审批状态 */
    private String finApproveStatus;

    /** 流程状态: pending=审批中 approved=已通过 rejected=已驳回 cancelled=已撤销 */
    private String flowStatus;

    /** 驳回理由 */
    private String rejectReason;

    /** 申请表单扩展数据 JSON（结算方式/扣款门店/对方集团/偿还门店等） */
    private String extra;

    /** 实际审批节点实例JSON（动态解析后的节点+审批人数据） */
    private String approvalNodes;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
