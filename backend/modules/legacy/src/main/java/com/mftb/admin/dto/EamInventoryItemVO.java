package com.mftb.admin.dto;

import lombok.Data;

/** 盘点明细视图对象（v2） */
@Data
public class EamInventoryItemVO {

    private Long id;

    /** 关联盘点任务 ID */
    private Long taskId;

    /** 契约版本(1=历史,2=新版) */
    private Integer contractVersion;

    /** 资产 ID */
    private Long assetId;

    /** 资产编号 */
    private String assetNo;

    /** 资产名称 */
    private String assetName;

    /** 资产分类 */
    private String assetType;

    /** 存放位置（发起时账面快照） */
    private String location;

    /** 实物结果：pending/normal/lost/damaged */
    private String status;

    /** 备注 */
    private String remark;

    /* ---------- 发起时账面快照 ---------- */
    private String bookStatus;
    private String bookHoldType;
    private Long bookLocationId;
    private String bookDept;
    private String holderName;
    private String holderEmpNo;
    private Long holderId;
    private Integer companyBrand;

    /* ---------- 实际核对记录 ---------- */
    private Long actualLocationId;
    private String actualLocationName;
    private String actualLocationOther;
    private String locationCheckResult;
    private String actualHolderType;
    private Long actualHolderId;
    private String actualHolderEmpNo;
    private String actualHolderName;
    private String actualHolderExternal;
    private String holderCheckResult;
    private String checkMethod;
    private String checkedAt;
    private String checkedBy;
    private String checkedByEmpNo;

    /* ---------- 期间业务变更 ---------- */
    private Integer recheckRequired;
    /** 核对时台账关键快照（供差异对照） */
    private String currentStatus;
    private String currentLocationName;
    private String currentHolderName;

    /** 是否异常资产 */
    private Integer anomalyFlag;

    /** 明细修订号 */
    private Integer itemRevision;

    private String createdAt;
    private String updatedAt;
}
