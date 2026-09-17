package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 交接记录视图 VO
 */
@Data
public class EamHandoverVO {
    private Long id;
    private String handoverNo;
    private Long fromUserId;
    private String fromUserName;
    private String fromDepartment;
    private Long toUserId;
    private String toUserName;
    private String toDepartment;
    private String handoverDate;
    private Integer assetCount;
    private String reason;
    private String status;
    private String operatorName;
    private String remark;
    private String createdAt;
    /** 最后更新人 */
    private String updatedBy;
    /** 最后更新时间 */
    private String updatedAt;
    /** 交接资产 ID 列表（列表页/详情页均返回） */
    private List<Long> assetIds;
    /** 交接资产明细（仅详情页返回） */
    private List<HandoverItemVO> items;

    @Data
    public static class HandoverItemVO {
        private Long assetId;
        private String assetNo;
        private String assetName;
        private String assetType;
        private String oldDepartment;
        private String newDepartment;
    }
}
