package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产盘点任务实体
 */
@Data
@TableName("biz_eam_inventory_task")
public class EamInventoryTask {

    @TableId
    private Long id;

    /** 盘点任务编号（PD+YYYYMMDD+4位） */
    private String taskNo;

    /** 盘点任务名称 */
    private String taskName;

    /** 盘点日期 */
    private String inventoryDate;

    /** 盘点人 */
    private String operator;

    /** 应盘数量 */
    private Integer expectedCount;

    /** 实盘数量 */
    private Integer actualCount;

    /** 差异数（实盘-应盘） */
    private Integer diffCount;

    /** 状态：in_progress/completed/partially_completed/cancelled */
    private String status;

    /** 备注 */
    private String remark;

    /** 契约版本(1=历史,2=新版) */
    private Integer contractVersion;

    /** 范围模式 CONDITION/ALL */
    private String scopeMode;

    /** 范围原始条件快照 JSON */
    private String scopeJson;

    /** 展开后范围 ID/名称快照 JSON */
    private String scopeResolvedJson;

    /** 范围指纹 */
    private String scopeHash;

    /** 应盘清单冻结时间 */
    private LocalDateTime snapshotAt;

    /** 盘点负责人 sys_user.id */
    private Long ownerId;

    /** 盘点负责人工号 */
    private String ownerEmpNo;

    /** 盘点负责人姓名 */
    private String ownerName;

    /** 创建人 sys_user.id */
    private Long createdById;

    /** 创建人工号 */
    private String createdByEmpNo;

    /** 任务修订号(并发控制) */
    private Integer taskRevision;

    /** 已核对数 */
    private Integer checkedCount;

    /** 实物确认数(完好+损坏) */
    private Integer confirmedCount;

    /** 异常资产去重数 */
    private Integer anomalyCount;

    /** 未完成核对数 */
    private Integer notCheckedCount;

    /** 未找到数 */
    private Integer missingCount;

    /** 实物损坏数 */
    private Integer damagedCount;

    /** 位置差异数 */
    private Integer locationDiffCount;

    /** 持有人差异数 */
    private Integer holderDiffCount;

    /** 期间业务变更待复核数 */
    private Integer recheckCount;

    /** 结束方式 COMPLETE/PARTIAL/CANCEL */
    private String closeType;

    /** 结束原因 */
    private String closeReason;

    /** 结束时间 */
    private LocalDateTime closedAt;

    /** 结束操作人 */
    private String closedBy;

    /** 结束操作人 ID */
    private Long closedById;

    /** 取消时间 */
    private LocalDateTime cancelledAt;

    /** 取消操作人 */
    private String cancelledBy;

    /** 取消原因 */
    private String cancelReason;

    /** 创建幂等键 */
    private String createRequestKey;

    /** 创建请求摘要 */
    private String createRequestHash;

    /** 创建人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
