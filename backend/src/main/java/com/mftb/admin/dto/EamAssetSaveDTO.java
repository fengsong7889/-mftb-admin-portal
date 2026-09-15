package com.mftb.admin.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** 台账可编辑字段；采购来源、批次和审计字段只由服务端维护。 */
@Data
public class EamAssetSaveDTO {
    private String assetNo;
    private String assetName;
    private String assetType;
    private Long categoryId;
    private String categoryCode;
    private String brand;
    private Long brandId;
    private Long modelId;
    private Map<String, String> params;
    private String images;
    private String unit;
    private Integer quantity;
    private BigDecimal purchaseValue;
    private String purchaseDate;
    private String usageDate;
    private String source;
    private String company;
    private String location;
    private Long locationId;
    private String department;
    private String userName;
    private String status;
    private String holdType;
    private String scrapTime;
    private String leaseCompany;
    private BigDecimal rentalCost;
    private List<String> rentalPeriod;
    private String remark;
}
