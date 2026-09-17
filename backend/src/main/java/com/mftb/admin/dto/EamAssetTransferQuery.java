package com.mftb.admin.dto;

import lombok.Data;

/**
 * 资产调拨记录查询参数
 */
@Data
public class EamAssetTransferQuery {

    private int page = 1;

    private int size = 10;

    /** 资产编号精确/前缀过滤 */
    private String assetNo;

    /** 关键字：调拨单号 / 资产名称 / 使用人姓名模糊 */
    private String keyword;

    /** 调拨日期起 yyyy-MM-dd */
    private String startDate;

    /** 调拨日期止 yyyy-MM-dd */
    private String endDate;
}
