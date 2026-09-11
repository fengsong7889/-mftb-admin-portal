package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 資產台賬實體
 */
@Data
@TableName("biz_eam_asset")
public class EamAsset {

    @TableId
    private Long id;

    /** 資產編號（系統生成，唯一） */
    private String assetNo;

    /** 資產名稱 */
    private String assetName;

    /** 資產分類名稱 */
    private String assetType;

    /** 分類 ID */
    private Long categoryId;

    /** 分類編碼 */
    private String categoryCode;

    /** 品牌 */
    private String brand;

    /** 品牌 ID */
    private Long brandId;

    /** 型號 ID */
    private Long modelId;

    /** 參數信息 JSON */
    private String params;

    /** 單位 */
    private String unit;

    /** 購買價值 */
    private BigDecimal purchaseValue;

    /** 購買日期 */
    private String purchaseDate;

    /** purchase/lease */
    private String purchaseType;

    /** 來源：self/lease */
    private String source;

    /** 所屬公司 */
    private String company;

    /** 存放地點名稱 */
    private String location;

    /** 存放位置 ID */
    private Long locationId;

    /** 歸屬部門 */
    private String department;

    /** 使用人 */
    private String userName;

    /** 狀態：idle/in_use/in_repair/scrapped */
    private String status;

    /** 持有方式：owned/borrowed */
    private String holdType;

    /** 關聯採購訂單 ID */
    private Long orderId;

    /** 關聯入庫批次 ID */
    private Long batchId;

    /** 備註 */
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    /** 最後更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
