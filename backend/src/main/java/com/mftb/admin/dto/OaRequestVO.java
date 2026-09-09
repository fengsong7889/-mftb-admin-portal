package com.mftb.admin.dto;

import com.mftb.admin.entity.OaApprovalTask;
import com.mftb.admin.entity.OaRequest;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * OA流程实例视图对象
 */
@Data
public class OaRequestVO {

    private Long id;

    /** 流程编号 */
    private String flowNo;

    /** 流程类型编码 */
    private String processCode;

    /** 流程类型名称 */
    private String processName;

    /** 流程标题 */
    private String title;

    /** 表单数据 */
    private Map<String, Object> formData;

    /** 申请人 */
    private String applicant;

    /** 流程状态 */
    private String flowStatus;

    /** 当前待审节点 */
    private String currentNodeName;

    /** 当前审批人 */
    private String currentApprover;

    /** 驳回理由 */
    private String rejectReason;

    /** 申请时间 */
    private String applyTime;

    /** 完成时间 */
    private String completeTime;

    /** 撤销时间 */
    private String cancelTime;

    // ==================== 审批中心专用字段 ====================

    /** 集团ID */
    private String groupId;

    /** 集团名称 */
    private String groupName;

    /** 品牌 */
    private String brand;

    /** 业务主管-审批人 */
    private String bizApprover;

    /** 业务主管-审批时间 */
    private String bizApproveTime;

    /** 业务主管-审批状态 */
    private String bizApproveStatus;

    /** 运营主管-审批人 */
    private String opsApprover;

    /** 运营主管-审批时间 */
    private String opsApproveTime;

    /** 运营主管-审批状态 */
    private String opsApproveStatus;

    /** 财务主管-审批人 */
    private String finApprover;

    /** 财务主管-审批时间 */
    private String finApproveTime;

    /** 财务主管-审批状态 */
    private String finApproveStatus;

    /** 审批任务节点列表 */
    private List<OaApprovalTaskVO> approvalTasks;

    public static OaRequestVO from(OaRequest request) {
        OaRequestVO vo = new OaRequestVO();
        vo.setId(request.getId());
        vo.setFlowNo(request.getFlowNo());
        vo.setProcessCode(request.getProcessCode());
        vo.setTitle(request.getTitle());
        vo.setFormData(JsonUtils.parseMap(request.getFormData()));
        vo.setApplicant(request.getApplicant());
        vo.setFlowStatus(request.getFlowStatus());
        vo.setCurrentNodeName(request.getCurrentNodeName());
        vo.setCurrentApprover(request.getCurrentApprover());
        vo.setRejectReason(request.getRejectReason());
        vo.setApplyTime(DateTimeUtils.format(request.getApplyTime()));
        vo.setCompleteTime(DateTimeUtils.format(request.getCompleteTime()));
        vo.setCancelTime(DateTimeUtils.format(request.getCancelTime()));
        // 审批中心字段
        vo.setGroupId(request.getGroupId());
        vo.setGroupName(request.getGroupName());
        vo.setBrand(request.getBrand());
        vo.setBizApprover(request.getBizApprover());
        vo.setBizApproveTime(DateTimeUtils.format(request.getBizApproveTime()));
        vo.setBizApproveStatus(request.getBizApproveStatus());
        vo.setOpsApprover(request.getOpsApprover());
        vo.setOpsApproveTime(DateTimeUtils.format(request.getOpsApproveTime()));
        vo.setOpsApproveStatus(request.getOpsApproveStatus());
        vo.setFinApprover(request.getFinApprover());
        vo.setFinApproveTime(DateTimeUtils.format(request.getFinApproveTime()));
        vo.setFinApproveStatus(request.getFinApproveStatus());
        return vo;
    }

    /**
     * 审批任务节点视图
     */
    @Data
    public static class OaApprovalTaskVO {
        private Long id;
        private String nodeName;
        private Integer sortOrder;
        private String approvalRule;
        private String approver;
        private String taskStatus;
        private String approveTime;
        private String comment;

        public static OaApprovalTaskVO from(OaApprovalTask task) {
            OaApprovalTaskVO vo = new OaApprovalTaskVO();
            vo.setId(task.getId());
            vo.setNodeName(task.getNodeName());
            vo.setSortOrder(task.getSortOrder());
            vo.setApprovalRule(task.getApprovalRule());
            vo.setApprover(task.getApprover());
            vo.setTaskStatus(task.getTaskStatus());
            vo.setApproveTime(DateTimeUtils.format(task.getApproveTime()));
            vo.setComment(task.getComment());
            return vo;
        }
    }
}
