package com.mftb.admin.dto;

import lombok.Data;

/**
 * 资产调拨记录查询参数
 */
@Data
public class EamAssetTransferQuery {

    private int page = 1;

    private int size = 10;
    private Long brandId;
    private Long fromDepartmentId;
    private Long toDepartmentId;

    /** 调拨单号（精确/前缀） */
    private String transferNo;

    /** 资产编号（模糊） */
    private String assetNo;

    /** 资产名称（模糊） */
    private String assetName;

    /** 原使用人（模糊） */
    private String fromUserName;

    /** 调入使用人（模糊） */
    private String toUserName;

    /** 原归属部门（模糊） */
    private String fromDepartment;

    /** 调入部门（模糊） */
    private String toDepartment;

    /** 状态（精确）：done / cancelled */
    private String status;

    /** 经办人（模糊） */
    private String operatorName;

    /** 调拨日期起 yyyy-MM-dd */
    private String startDate;

    /** 调拨日期止 yyyy-MM-dd */
    private String endDate;
}
