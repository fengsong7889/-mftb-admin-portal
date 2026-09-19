package com.mftb.admin.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.List;

/** 盘点任务视图对象 */
@Data
@JsonInclude(JsonInclude.Include.ALWAYS)
public class EamInventoryTaskVO {

    private Long id;

    /** 盘点任务编号 */
    private String taskNo;

    /** 盘点任务名称 */
    private String taskName;

    /** 盘点日期 */
    private String inventoryDate;

    /** 盘点人 */
    private String operator;

    /** 应盘数量 */
    private Integer expectedCount;

    /** 实盘数量 */
    private Integer actualCount;

    /** 差异数 */
    private Integer diffCount;

    /** 状态：in_progress/completed/cancelled */
    private String status;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String createdBy;

    private String createdAt;

    private String updatedBy;

    private String updatedAt;

    /** 盘点明细列表（详情接口返回） */
    private List<EamInventoryItemVO> items;
}
