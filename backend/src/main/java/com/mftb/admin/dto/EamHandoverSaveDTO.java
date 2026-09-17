package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 交接登记请求 DTO
 */
@Data
public class EamHandoverSaveDTO {
    /** 交出人姓名 */
    private String fromUserName;
    /** 交出人部门 */
    private String fromDepartment;
    /** 接收人姓名 */
    private String toUserName;
    /** 接收人部门 */
    private String toDepartment;
    /** 交接日期 yyyy-MM-dd */
    private String handoverDate;
    /** 交接资产 ID 列表 */
    private List<Long> assetIds;
    /** 交接原因：resign/transfer/other */
    private String reason;
    /** 操作人姓名 */
    private String operatorName;
    /** 备注 */
    private String remark;
}
