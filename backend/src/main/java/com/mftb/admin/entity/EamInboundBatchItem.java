package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 验收入库批次明细实体
 */
@Data
@TableName("biz_eam_inbound_batch_item")
public class EamInboundBatchItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 所属批次 ID */
    private Long batchId;

    /** 资产型号 ID */
    private Long modelId;

    /** 资产名称 */
    private String modelName;

    /** 验收数量 */
    private Integer qty;

    /** 存放位置 ID */
    private Long locationId;

    /** 生成的资产编号列表 JSON */
    private String assetNos;

    /** 验收处置方式：pass=通过 / return=退货 / exchange=换货 / concession=让步接收 */
    private String disposition;

    /** 验收不通过原因 */
    private String rejectReason;
    
    /** 验收照片 JSON 数组 [{name,dataUrl}] */
    private String photos;

    /** 配件清单 JSON 数组 [{name,qty}] */
    private String accessories;

    /** 排序 */
    private Integer sortOrder;
}
