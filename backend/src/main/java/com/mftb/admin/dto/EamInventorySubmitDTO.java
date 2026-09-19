package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/** 盘点结果提交 DTO */
@Data
public class EamInventorySubmitDTO {

    /** 盘点任务编号 */
    private String taskNo;

    /** 盘点明细列表 */
    private List<EamInventorySubmitItemDTO> items;

    /** 备注 */
    private String remark;
}
