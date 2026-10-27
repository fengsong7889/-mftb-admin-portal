package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产盘点明细实体
 */
@Data
@TableName("biz_eam_inventory_item")
public class EamInventoryItem {

    @TableId
    private Long id;

    /** 关联盘点任务 ID */
    private Long taskId;

    /** 资产 ID */
    private Long assetId;

    /** 资产编号（快照） */
    private String assetNo;

    /** 资产名称（快照） */
    private String assetName;

    /** 资产分类（快照） */
    private String assetType;

    /** 存放位置（快照） */
    private String location;

    /** 盘点状态：pending/normal/lost/damaged */
    private String status;

    /** 备注 */
    private String remark;

    /** 契约版本(1=历史,2=新版) */
    private Integer contractVersion;

    /** 发起时账面快照 JSON */
    private String bookSnapshotJson;

    /** 发起时台账关键字段指纹 */
    private String ledgerFingerprint;

    /** 实际位置 ID */
    private Long actualLocationId;

    /** 实际位置名称快照 */
    private String actualLocationName;

    /** 其他位置自由文本 */
    private String actualLocationOther;

    /** 位置核对 CONSISTENT/DIFF/PENDING/NA */
    private String locationCheckResult;

    /** 实际持有人类型 EMPLOYEE/NONE/EXTERNAL/PENDING */
    private String actualHolderType;

    /** 实际持有人 sys_user.id */
    private Long actualHolderId;

    /** 实际持有人工号 */
    private String actualHolderEmpNo;

    /** 实际持有人姓名 */
    private String actualHolderName;

    /** 外部保管名称 */
    private String actualHolderExternal;

    /** 持有人核对 CONSISTENT/DIFF/PENDING/NA */
    private String holderCheckResult;

    /** 核对方式 ONSITE/HOLDER/DOC */
    private String checkMethod;

    /** 核对时间 */
    private LocalDateTime checkedAt;

    /** 核对操作人 */
    private String checkedBy;

    /** 核对操作人 ID */
    private Long checkedById;

    /** 核对操作人工号 */
    private String checkedByEmpNo;

    /** 明细修订号(并发控制) */
    private Integer itemRevision;

    /** 核对时台账快照 JSON */
    private String currentSnapshotJson;

    /** 结束时台账比对快照 JSON */
    private String closedSnapshotJson;

    /** 期间业务变更待复核 */
    private Integer recheckRequired;

    /** 是否异常资产(去重统计) */
    private Integer anomalyFlag;

    /** 发起时使用人姓名快照 */
    private String holderName;

    /** 发起时使用人工号快照 */
    private String holderEmpNo;

    /** 发起时资产归属部门快照 */
    private String holderDept;

    /** 创建人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
