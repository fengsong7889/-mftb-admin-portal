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

    /* ---- 持有快照 ---- */
    private Long originalHolderId;
    private String originalHolderName;
    private String originalDepartment;
    private String lastKnownLocation;

    /* ---- 报失信息 ---- */
    private String lossDate;
    private String lossReason;
    private Long reporterId;
    private String reporterName;

    /* ---- 状态 ---- */
    private String status;
    /** 未结天数（从登记日期算起，已结案则为结案前天数） */
    private Integer openDays;

    /* ---- 找回信息 ---- */
    private String recoveredDate;
    private String recoveredLocation;
    private Long recoveredById;
    private String recoveredByName;
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
        private Long evidenceId;
        private String createdAt;
    }
}
