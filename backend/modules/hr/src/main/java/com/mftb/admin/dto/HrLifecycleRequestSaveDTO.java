package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDate;

/**
 * HR 入转调离单据新增/编辑请求（草稿保存与重新提交共用）
 */
@Data
public class HrLifecycleRequestSaveDTO {

    /** 单据类型: onboard/regular/transfer/dimission（新增必填，编辑时以库内为准） */
    private String type;

    /** 目标员工 sys_user.id（转正/调动/离职必填；入职单为空） */
    private Long userId;

    @NotBlank(message = "姓名不能為空")
    private String empName;

    /** 目标部门ID（入职=入职部门；调动时为冗余记录，实际以 newDeptId 为准） */
    private Long deptId;

    /** 职位ID（入职=入职职位） */
    private Long positionId;

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

    /** 证件号码 */
    private String idCardNo;

    /** 手机号 */
    private String mobile;

    /** 邮箱 */
    private String email;

    /** 入职资料 JSON（学历/工作经历/银行信息等，字符串原样存储） */
    private String candidateInfo;

    // ── 调动明细 ──

    /** 调入部门ID */
    private Long newDeptId;

    /** 调入职位ID */
    private Long newPositionId;

    /** 调动后任职公司（HR 字典 EMPLOYER_COMPANY） */
    private String newCompany;

    /** 调动后直属上级 */
    private String newSuperior;

    // ── 离职明细 ──

    /** 离职类型: voluntary/involuntary/expired */
    private String dimissionType;

    /** 最后工作日 */
    private LocalDate lastWorkDate;

    /** 离职结算 JSON（字符串原样存储） */
    private String settlementInfo;

    // ── 合同续签明细（type=renew） ──

    /** 被续签的原合同ID（emp_contract.id，续签必填） */
    private Long contractId;

    /** 新合同编号（为空由后端按「原编号-R{n}」自动派生） */
    private String newContractNo;

    /** 新合同类型（HR 字典 CONTRACT_TYPE） */
    private String newContractType;

    /** 新合同签约主体（HR 字典 EMPLOYER_COMPANY） */
    private String newContractCompany;

    /** 新合同开始日期（为空时取原合同结束日次日） */
    private LocalDate newContractStartDate;

    /** 新合同结束日期（续签必填） */
    private LocalDate newContractEndDate;

    /** 备注 */
    private String remark;
}
