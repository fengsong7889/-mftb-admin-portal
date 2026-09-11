package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 驗收入庫批次明細實體
 */
@Data
@TableName("biz_eam_inbound_batch_item")
public class EamInboundBatchItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所屬批次 ID */
    private Long batchId;

    /** 資產型號 ID */
    private Long modelId;

    /** 資產名稱 */
    private String modelName;

    /** 驗收數量 */
    private Integer qty;

    /** 存放位置 ID */
    private Long locationId;

    /** 生成的資產編號列表 JSON */
    private String assetNos;

    /** 排序 */
    private Integer sortOrder;
}
