package com.mftb.admin.dto;

import lombok.Data;

/** 台账分页与筛选条件。日期范围由前端展开，避免数组绑定差异。 */
@Data
public class EamAssetQuery {
    private int page = 1;
    private int size = 10;
    private String keyword;
    private String assetNo;
    private String assetName;
    private String assetType;
    private String brand;
    private Long brandId;
    private Long categoryId;
    private Long departmentId;
    private String holdType;
    /** 所属品牌（sys_company_brand.id） */
    private Integer companyBrand;
    private String status;
    private String company;
    private String department;
    private String userName;
    /** 当前持有人（sys_user.id 精确匹配） */
    private Long currentHolderId;
    private String source;
    private Long orderId;
    private Long batchId;
    private String purchaseDateStart;
    private String purchaseDateEnd;
    private String scrapDateStart;
    private String scrapDateEnd;
    private String updatedBy;
    private String updatedAtStart;
    private String updatedAtEnd;
}
