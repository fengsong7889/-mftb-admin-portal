package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 耗材出入库流水视图对象
 */
@Data
public class EamConsumableTxnVO {
    private Long id;
    private String txnNo;
    private Long itemId;
    private String itemCode;
    private String itemName;
    private Long locationId;
    private String locationName;
    private String txnType;
    private Integer qty;
    private Integer beforeQty;
    private Integer afterQty;
    private BigDecimal unitCost;
    /** 变动成本金额（入库正/出库负） */
    private BigDecimal amount;
    /** 所属品牌 ID 快照 */
    private Long companyBrand;
    /** 购买公司 ID 快照 */
    private Long purchaseCompanyId;
    /** 承担部门名称快照 */
    private String department;
    /** 领用人工号 */
    private String applicantEmpId;
    /** 领用人姓名 */
    private String applicantName;
    /** 业务记账日期 */
    private String bizDate;
    private String refType;
    private Long refId;
    private String operator;
    private String remark;
    private String createdAt;
}
