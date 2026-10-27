package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 验收入库批次实体
 */
@Data
@TableName("biz_eam_inbound_batch")
public class EamInboundBatch {

    @TableId
    private Long id;

    /** 批次编号 */
    private String batchNo;

    /** 关联采购订单 ID */
    private Long poId;

    /** 采购订单号（冗余） */
    private String poNo;

    /** 所属品牌：1=閃蜂, 2=mFood */
    private Integer brand;

    /** 验收日期 */
    private String inboundDate;

    /** 操作人 */
    private String operator;

    /** 管理部門 ID (sys_dept.id) */
    private Long departmentId;

    /** 管理部門名稱快照 */
    private String departmentName;

    /** 入库总数 */
    private Integer totalQty;

    /** 已验收数量 */
    private Integer acceptedQty;

    /** 未验收数量 */
    private Integer pendingQty;

    /** 退货数量 */
    private Integer returnQty;

    /** 换货数量 */
    private Integer exchangeQty;

    /** 让步接收数量 */
    private Integer concessionQty;

    /** 实际生成资产数（反规范化，PR-2） */
    private Integer generatedAssetCount;

    /** 采购事由 */
    private String purchaseReason;

    /** 备注 */
    private String remark;

    /** 契约版本（v2=多结果分配模型） */
    private Integer contractVersion;

    /** 幂等请求键 */
    private String requestKey;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
