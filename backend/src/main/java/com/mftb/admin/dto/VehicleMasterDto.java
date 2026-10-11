package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 车辆参数库（品牌 / 车系 / 年款车型）出入参契约。
 *
 * <p>入参里没有 id 之外的审计字段：创建人、更新人一律服务端从登录态取。
 * <p>出参带 parentName 快照，前端级联与列表都要显示"这条车系属于哪个品牌"，
 * 让前端再发一次请求去拼名字只会多一个可以出错的环节。
 */
public final class VehicleMasterDto {

    private VehicleMasterDto() {
    }

    /** 品牌视图 */
    @Data
    public static class BrandVO {
        private Long id;
        private String brandName;
        private String brandNameEn;
        private String countryOrigin;
        private String status;
        private Integer sortOrder;
        private String remark;
        /** 该品牌下的车系数：列表页据此解释"为什么这条删不掉" */
        private Integer seriesCount;
        /** 仍引用该品牌的车辆数 */
        private Integer vehicleCount;
        private String updatedBy;
        private String updatedAt;
    }

    /** 品牌保存入参 */
    @Data
    public static class BrandSave {
        private Long id;
        private String brandName;
        private String brandNameEn;
        private String countryOrigin;
        private String status;
        private Integer sortOrder;
        private String remark;
    }

    /** 车系视图 */
    @Data
    public static class SeriesVO {
        private Long id;
        private Long brandId;
        private String brandName;
        private String seriesName;
        private String bodyType;
        private String energyType;
        private Integer seatCount;
        private String status;
        private String remark;
        private Integer modelCount;
        private Integer vehicleCount;
        private String updatedBy;
        private String updatedAt;
    }

    /** 车系保存入参 */
    @Data
    public static class SeriesSave {
        private Long id;
        private Long brandId;
        private String seriesName;
        private String bodyType;
        private String energyType;
        private Integer seatCount;
        private String status;
        private String remark;
    }

    /** 年款车型视图 */
    @Data
    public static class ModelVO {
        private Long id;
        private Long seriesId;
        private String brandName;
        private String seriesName;
        private String modelName;
        private String yearLabel;
        private String displacement;
        private String gearbox;
        private Integer seatCount;
        private BigDecimal basePrice;
        private String status;
        private String remark;
        private Integer vehicleCount;
        private String updatedBy;
        private String updatedAt;
    }

    /** 年款车型保存入参 */
    @Data
    public static class ModelSave {
        private Long id;
        private Long seriesId;
        private String modelName;
        private String yearLabel;
        private String displacement;
        private String gearbox;
        private Integer seatCount;
        private BigDecimal basePrice;
        private String status;
        private String remark;
    }
}
