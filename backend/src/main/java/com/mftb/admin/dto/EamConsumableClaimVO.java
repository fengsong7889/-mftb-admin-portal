package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 耗材领用单视图对象（含明细）
 */
@Data
public class EamConsumableClaimVO {
    private Long id;
    private String claimNo;
    private Long applicantId;
    private String applicantName;
    private String applicantEmpId;
    private String department;
    /** 承担部门 ID */
    private Long departmentId;
    /** 所属品牌 ID 快照 */
    private Long companyBrand;
    /** 购买公司 ID 快照 */
    private Long purchaseCompanyId;
    /** 购买公司名称快照 */
    private String purchaseCompany;
    /** 出库成本合计 */
    private BigDecimal costAmount;
    private String reason;
    private String status;
    private Long approverId;
    private String approverName;
    private String approvedAt;
    private String approveRemark;
    private String issueOperator;
    private String issuedAt;
    private String cancelReason;
    private String createdBy;
    private String createdAt;
    private String updatedBy;
    private String updatedAt;

    /** 明细行 */
    private List<EamConsumableClaimItemVO> items;
    /** 品类数 */
    private Integer totalKinds;
    /** 领用总数量 */
    private Integer totalQty;
}
