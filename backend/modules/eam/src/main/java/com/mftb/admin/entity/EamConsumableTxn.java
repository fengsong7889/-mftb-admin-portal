package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 耗材出入库流水实体（append-only，审计与统计的数据源）
 */
@Data
@TableName("biz_eam_consumable_txn")
public class EamConsumableTxn {

    @TableId
    private Long id;

    /** 流水号（CK+时间戳+随机） */
    private String txnNo;

    /** 耗材 ID */
    private Long itemId;

    /** 耗材编码快照 */
    private String itemCode;

    /** 耗材名称快照 */
    private String itemName;

    /** 仓库 ID */
    private Long locationId;

    /** 仓库名称快照 */
    private String locationName;

    /** 类型：in_purchase/in_manual/in_adjust/out_claim/out_adjust */
    private String txnType;

    /** 变动数量（入库正/出库负） */
    private Integer qty;

    /** 变动前库存 */
    private Integer beforeQty;

    /** 变动后库存 */
    private Integer afterQty;

    /** 入库单价（成本核算） */
    private BigDecimal unitCost;

    /** 变动成本金额（入库正/出库负） */
    private BigDecimal amount;

    /** 所属品牌 ID 快照 */
    private Long companyBrand;

    /** 购买公司 ID 快照 */
    private Long purchaseCompanyId;

    /** 承担部门 ID */
    private Long departmentId;

    /** 承担部门名称快照 */
    private String department;

    /** 领用人 ID（sys_user.id） */
    private Long applicantId;

    /** 领用人工号 */
    private String applicantEmpId;

    /** 领用人姓名 */
    private String applicantName;

    /** 业务记账日期 */
    private LocalDate bizDate;

    /** 幂等键（来源单据行） */
    private String idempotencyKey;

    /** 关联单据类型：claim/adjust */
    private String refType;

    /** 关联单据 ID */
    private Long refId;

    /** 操作人 ID */
    private Long operatorId;

    /** 操作人姓名 */
    private String operator;

    /** 备注 */
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
