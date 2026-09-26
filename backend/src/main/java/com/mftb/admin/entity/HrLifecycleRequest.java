package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 入转调离生命周期单据（入职/转正/调动/离职）。
 * <p>
 * 单据提交后关联 OA 审批流程（flow_no → biz_oa_request），审批全部通过后由
 * {@code HrLifecycleCallbackService} 执行办理动作（建账号/写职务记录/离职停用）。
 * 状态机见 {@link com.mftb.admin.constant.HrLifecycleConstants}。
 * 参考 SQL: backend/sql/195_hr_lifecycle.sql
 */
@Data
@TableName("hr_lifecycle_request")
public class HrLifecycleRequest {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 单据编号（RS+YYYYMMDD+4位序号） */
    private String reqNo;

    /** 单据类型: onboard/regular/transfer/dimission */
    private String type;

    /** 单据状态: draft/pending/approved/rejected/completed */
    private String status;

    /** 关联 OA 流程编号（biz_oa_request.flow_no，每次提交生成新流程） */
    private String flowNo;

    // ── 目标员工（入职单为候选人，账号创建后回填 userId/empNo） ──

    /** 关联 sys_user.id（入职完成后回填） */
    private Long userId;

    /** 姓名/候选人姓名 */
    private String empName;

    /** 员工工号（入职完成后回填） */
    private String empNo;

    /** 目标部门ID（入职=入职部门） */
    private Long deptId;

    /** 部门名称快照 */
    private String deptName;

    /** 职位ID（关联 sys_position） */
    private Long positionId;

    /** 职位名称快照 */
    private String positionName;

    /** 生效日期（入职单=计划入职日期） */
    private LocalDate effectiveDate;

    /** 申请事由 */
    private String reason;

    // ── 入职明细 ──

    /** Offer 发放日期 */
    private LocalDate offerDate;

    /** 试用期月数（0=无试用期直接转正） */
    private Integer probationMonths;

    /** 预计转正日期 */
    private LocalDate expectedRegularDate;

    /** 证件号码（入职重复校验） */
    private String idCardNo;

    /** 手机号 */
    private String mobile;

    /** 邮箱 */
    private String email;

    /** 入职资料 JSON（学历/工作经历/银行信息等） */
    private String candidateInfo;

    // ── 调动明细 ──

    /** 调动前部门快照 */
    private String oldDeptName;

    /** 调动前职位快照 */
    private String oldPositionName;

    /** 调入部门ID */
    private Long newDeptId;

    /** 调入部门名称快照 */
    private String newDeptName;

    /** 调入职位ID */
    private Long newPositionId;

    /** 调入职位名称快照 */
    private String newPositionName;

    /** 调动后任职公司（HR 字典 EMPLOYER_COMPANY） */
    private String newCompany;

    /** 调动后直属上级 */
    private String newSuperior;

    // ── 离职明细 ──

    /** 离职类型: voluntary/involuntary/expired */
    private String dimissionType;

    /** 最后工作日 */
    private LocalDate lastWorkDate;

    /** 离职结算 JSON（资产归还/薪资结算/交接说明等） */
    private String settlementInfo;

    // ── 合同续签明细（type=renew） ──

    /** 被续签的原合同ID（emp_contract.id） */
    private Long contractId;

    /** 原合同编号快照 */
    private String contractNo;

    /** 新合同编号 */
    private String newContractNo;

    /** 新合同类型（HR 字典 CONTRACT_TYPE） */
    private String newContractType;

    /** 新合同签约主体（HR 字典 EMPLOYER_COMPANY） */
    private String newContractCompany;

    /** 新合同开始日期 */
    private LocalDate newContractStartDate;

    /** 新合同结束日期 */
    private LocalDate newContractEndDate;

    // ── 办理结果 ──

    /** 备注/办理结果说明 */
    private String remark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
