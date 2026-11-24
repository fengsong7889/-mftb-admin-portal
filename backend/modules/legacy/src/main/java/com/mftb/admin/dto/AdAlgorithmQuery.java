/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;

/** 算法库筛选契约；业务适用范围与实际投放频道独立，筛选先于分页。 */
@Data
public class AdAlgorithmQuery {
    @Min(1) private long page = 1;
    @Min(1) @Max(500) private long size = 10;
    private Integer algoType;
    @Size(max = 30) private String brand;
    private Integer channel;
    private Integer status;
    @Size(max = 100) private String keyword;
    @Size(max = 100) private String storeCode;
    private Boolean hasPricing;
    private Integer pricingChannel;
    /** 不传维持旧消费者的门店口径，商品必须显式传 2。 */
    @Min(1) @Max(2) private Integer targetType;
    @Min(1) @Max(2) private Integer businessType;
    @Size(max = 100) private String code;
    @Size(max = 100) private String name;
    @Size(max = 100) private String updatedBy;
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) private LocalDateTime updatedFrom;
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) private LocalDateTime updatedTo;
    /** 调用用途: library=算法库 / scenario=场景引用选择器 / slot=基础坑位 / sales=销售菜单。
     *  未声明的旧消费者默认不获得交互式相似推荐(type17)，避免未适配界面误展示。 */
    @Size(max = 20) private String usage;
}
