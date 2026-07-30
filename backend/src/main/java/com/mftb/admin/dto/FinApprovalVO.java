package com.mftb.admin.dto;

import com.mftb.admin.entity.FinApproval;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;

import java.util.Map;

/**
 * 审批流程视图对象（字段命名与前端审批中心表格 dataIndex 一致）
 */
@Data
public class FinApprovalVO {

    private Long id;

    /** 集团ID（对应 biz_fin_approval.group_code） */
    private String groupId;

    private String groupName;
    private String brand;
    private String flowNo;

    /** 审批类型: recharge / transfer / deduct / merge */
    private String approvalType;

    private String applicant;
    private String applyTime;

    /** 业务主管节点 */
    private String bizApprover;
    private String bizApproveTime;
    private String bizApproveStatus;

    /** 运营主管节点 */
    private String opsApprover;
    private String opsApproveTime;
    private String opsApproveStatus;

    /** 财务主管节点 */
    private String finApprover;
    private String finApproveTime;
    private String finApproveStatus;

    /** 流程状态: pending / approved / rejected / cancelled */
    private String flowStatus;

    private String rejectReason;

    /** 申请表单扩展数据（结算方式/扣款门店/对方集团/偿还门店等） */
    private Map<String, Object> extra;

    public static FinApprovalVO from(FinApproval approval) {
        FinApprovalVO vo = new FinApprovalVO();
        vo.setId(approval.getId());
        vo.setGroupId(approval.getGroupCode());
        vo.setGroupName(approval.getGroupName());
        vo.setBrand(approval.getBrand());
        vo.setFlowNo(approval.getFlowNo());
        vo.setApprovalType(approval.getApprovalType());
        vo.setApplicant(approval.getApplicant());
        vo.setApplyTime(DateTimeUtils.format(approval.getApplyTime()));
        vo.setBizApprover(dash(approval.getBizApprover()));
        vo.setBizApproveTime(dash(DateTimeUtils.format(approval.getBizApproveTime())));
        vo.setBizApproveStatus(approval.getBizApproveStatus());
        vo.setOpsApprover(dash(approval.getOpsApprover()));
        vo.setOpsApproveTime(dash(DateTimeUtils.format(approval.getOpsApproveTime())));
        vo.setOpsApproveStatus(approval.getOpsApproveStatus());
        vo.setFinApprover(dash(approval.getFinApprover()));
        vo.setFinApproveTime(dash(DateTimeUtils.format(approval.getFinApproveTime())));
        vo.setFinApproveStatus(approval.getFinApproveStatus());
        vo.setFlowStatus(approval.getFlowStatus());
        vo.setRejectReason(approval.getRejectReason());
        vo.setExtra(JsonUtils.parseMap(approval.getExtra()));
        return vo;
    }

    /** 未审批节点统一展示 -- */
    private static String dash(String value) {
        return value == null || value.isBlank() ? "--" : value;
    }
}
