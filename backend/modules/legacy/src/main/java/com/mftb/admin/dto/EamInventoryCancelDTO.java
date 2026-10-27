package com.mftb.admin.dto;

import lombok.Data;

/** 盘点任务取消 DTO（原因必填，保留已保存结果与操作记录） */
@Data
public class EamInventoryCancelDTO {

    /** 取消原因 */
    private String reason;

    /** 期望任务修订号 */
    private Integer expectedTaskRevision;

    /** 幂等键 */
    private String requestKey;
}
