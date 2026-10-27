package com.mftb.admin.dto;

import lombok.Data;

/** 入库单查询参数 */
@Data
public class EamConsumableInboundQuery {
    private Integer page;
    private Integer size;
    private String inboundNo;
    private String inboundType;
    private Long companyBrand;
    private Long purchaseCompanyId;
    private String startTime;
    private String endTime;
}
