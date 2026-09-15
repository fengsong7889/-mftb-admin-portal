package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 资产台账实体
 */
@Data
@TableName("biz_eam_asset")
public class EamAsset {

    @TableId
    private Long id;

    /** 资产编号（系统生成，唯一） */
    private String assetNo;

    /** 资产名称 */
    private String assetName;

    /** 资产分类名称 */
    private String assetType;

    /** 分类 ID */
    private Long categoryId;

    /** 分类编码 */
    private String categoryCode;

    /** 品牌 */
    private String brand;

    /** 品牌 ID */
    private Long brandId;

    /** 型号 ID */
    private Long modelId;

    /** 参数信息 JSON */
    private String params;

    /** 资产照片（Data URL，多张逗号分隔） */
    private String images;

    /** 单位 */
    private String unit;

    /** 购买价值 */
    private BigDecimal purchaseValue;

    /** 购买日期 */
    private String purchaseDate;

    /** purchase/lease */
    private String purchaseType;

    /** 来源：self/lease */
    private String source;

    /** 所属公司 */
    private String company;

    /** 存放地点名称 */
    private String location;

    /** 存放位置 ID */
    private Long locationId;

    /** 归属部门 */
    private String department;

    /** 使用人 */
    private String userName;

    /** 状态：idle/in_use/in_repair/scrapped */
    private String status;

    /** 持有方式：owned/borrowed */
    private String holdType;

    /** 关联采购订单 ID */
    private Long orderId;

    /** 关联入库批次 ID */
    private Long batchId;

    /** 备注 */
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
