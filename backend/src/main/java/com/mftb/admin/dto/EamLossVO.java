package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 遗失单视图 VO
 */
@Data
public class EamLossVO {
    private Long id;
    private String lossNo;
    private String sourceType;
    private Long sourceId;
    private Long returnId;

    /* ---- 资产快照 ---- */
    private Long assetId;
    private String assetNo;
    private String assetName;
    private String assetType;
    private String brand;
    /** 所属品牌/公司品牌 ID */
    private Integer companyBrand;
    /** 遗失时资产状态（idle=in_use 快照） */
    private String assetStatus;

    /* ---- 持有快照 ---- */
    private Long originalHolderId;
    private String originalHolderName;
    /** 原持有人工号 */
    private String originalHolderNo;
    private String originalDepartment;
    private String lastKnownLocation;

    /* ---- 报失信息 ---- */
    private String lossDate;
    private String lossReason;
    private Long reporterId;
    private String reporterName;
    /** 登记人工号 */
    private String reporterNo;

    /* ---- 状态 ---- */
    private String status;
    /** 未结天数（从登记日期算起，已结案则为结案前天数） */
    private Integer openDays;

    /* ---- 找回信息 ---- */
    private String recoveredDate;
    private String recoveredLocation;
    private Long recoveredById;
    private String recoveredByName;
    /** 找回登记人工号 */
    private String recoveredByNo;
    private String recoveredNote;

    /* ---- 验收信息 ---- */
    private String inspectionResult;
    private String inspectionDate;
    private String inspectionNote;

    /* ---- 核销信息 ---- */
    private String writeOffDate;
    private String writeOffReason;

    /* ---- 关联单据 ---- */
    private Long compensationId;
    /** 关联赔付单号（展示用） */
    private String compensationNo;
    private Long repairId;
    private Long scrapId;

    /* ---- 统计 ---- */
    /** 跟进次数 */
    private Integer followUpCount;
    /** 最近跟进时间 */
    private String lastFollowUpAt;

    /* ---- 元数据 ---- */
    private String createdAt;
    private String updatedAt;
    /** 最后更新人姓名 */
    private String updatedByName;
    private Integer fromMigration;

    /* ---- 事件日志（详情页加载） ---- */
    private List<EventVO> events;

    @Data
    public static class EventVO {
        private Long id;
        private String eventType;
        private String eventDesc;
        private String beforeValue;
        private String afterValue;
        private String changeReason;
        private Long operatorId;
        private String operatorName;
        /** 操作人工号 */
        private String operatorNo;
        private Long evidenceId;
        private String createdAt;
    }
}
