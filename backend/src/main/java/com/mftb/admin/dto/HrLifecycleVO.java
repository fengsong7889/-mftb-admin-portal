package com.mftb.admin.dto;

import com.mftb.admin.entity.HrLifecycleRequest;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 入转调离单据 VO（列表与详情共用）
 */
@Data
public class HrLifecycleVO {

    private Long id;
    /** 单据编号 */
    private String reqNo;
    /** 单据类型 */
    private String type;
    /** 单据状态 */
    private String status;
    /** 关联 OA 流程编号 */
    private String flowNo;

    private Long userId;
    private String empName;
    private String empNo;
    private Long deptId;
    private String deptName;
    private Long positionId;
    private String positionName;
    private LocalDate effectiveDate;
    private String reason;

    // 入职明细
    private LocalDate offerDate;
    private Integer probationMonths;
    private LocalDate expectedRegularDate;
    private String idCardNo;
    private String mobile;
    private String email;
    private String candidateInfo;

    // 调动明细
    private String oldDeptName;
    private String oldPositionName;
    private Long newDeptId;
    private String newDeptName;
    private Long newPositionId;
    private String newPositionName;
    private String newCompany;
    private String newSuperior;

    // 离职明细
    private String dimissionType;
    private LocalDate lastWorkDate;
    private String settlementInfo;

    // 合同续签明细
    private Long contractId;
    private String contractNo;
    private String newContractNo;
    private String newContractType;
    private String newContractCompany;
    private LocalDate newContractStartDate;
    private LocalDate newContractEndDate;

    private String remark;

    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // ==================== 执行（生效）状态 ====================
    /*
     * 审批状态与业务执行状态必须分开返（方案 §7.2）：否则「已批准」会被当成「已生效」，
     * HR 看到 approved 就以为人的账号已经按新部门生效了。
     */

    /** 执行状态：PENDING 待生效/执行中、DONE 已生效、FAILED 办理失败、CANCELLED 已作废；null = 无需执行 */
    private String executionStatus;
    /** 计划生效日（待生效时非空） */
    private java.time.LocalDate scheduledDate;
    /** 已尝试次数 */
    private Integer executionAttempts;
    /** 最近一次失败原因 */
    private String executionError;
    /** 实际执行完成时间 */
    private java.time.LocalDateTime executedAt;

    /** 把待生效任务信息贴到单据视图上（无任务时保持 null，表示「不需要到点执行」） */
    public void attachTask(com.mftb.admin.entity.HrEffectiveTask task) {
        if (task == null) {
            return;
        }
        this.executionStatus = task.getStatus();
        this.scheduledDate = task.getEffectiveDate();
        this.executionAttempts = task.getAttempts();
        this.executionError = task.getLastError();
        this.executedAt = task.getExecutedAt();
    }

    public static HrLifecycleVO from(HrLifecycleRequest e) {
        HrLifecycleVO vo = new HrLifecycleVO();
        vo.setId(e.getId());
        vo.setReqNo(e.getReqNo());
        vo.setType(e.getType());
        vo.setStatus(e.getStatus());
        vo.setFlowNo(e.getFlowNo());
        vo.setUserId(e.getUserId());
        vo.setEmpName(e.getEmpName());
        vo.setEmpNo(e.getEmpNo());
        vo.setDeptId(e.getDeptId());
        vo.setDeptName(e.getDeptName());
        vo.setPositionId(e.getPositionId());
        vo.setPositionName(e.getPositionName());
        vo.setEffectiveDate(e.getEffectiveDate());
        vo.setReason(e.getReason());
        vo.setOfferDate(e.getOfferDate());
        vo.setProbationMonths(e.getProbationMonths());
        vo.setExpectedRegularDate(e.getExpectedRegularDate());
        vo.setIdCardNo(e.getIdCardNo());
        vo.setMobile(e.getMobile());
        vo.setEmail(e.getEmail());
        vo.setCandidateInfo(e.getCandidateInfo());
        vo.setOldDeptName(e.getOldDeptName());
        vo.setOldPositionName(e.getOldPositionName());
        vo.setNewDeptId(e.getNewDeptId());
        vo.setNewDeptName(e.getNewDeptName());
        vo.setNewPositionId(e.getNewPositionId());
        vo.setNewPositionName(e.getNewPositionName());
        vo.setNewCompany(e.getNewCompany());
        vo.setNewSuperior(e.getNewSuperior());
        vo.setDimissionType(e.getDimissionType());
        vo.setLastWorkDate(e.getLastWorkDate());
        vo.setSettlementInfo(e.getSettlementInfo());
        vo.setContractId(e.getContractId());
        vo.setContractNo(e.getContractNo());
        vo.setNewContractNo(e.getNewContractNo());
        vo.setNewContractType(e.getNewContractType());
        vo.setNewContractCompany(e.getNewContractCompany());
        vo.setNewContractStartDate(e.getNewContractStartDate());
        vo.setNewContractEndDate(e.getNewContractEndDate());
        vo.setRemark(e.getRemark());
        vo.setCreatedBy(e.getCreatedBy());
        vo.setUpdatedBy(e.getUpdatedBy());
        vo.setCreatedAt(e.getCreatedAt());
        vo.setUpdatedAt(e.getUpdatedAt());
        return vo;
    }
}
