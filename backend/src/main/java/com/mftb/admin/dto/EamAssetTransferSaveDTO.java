package com.mftb.admin.dto;

import lombok.Data;

/**
 * 资产调拨登记请求 DTO
 * <p>
 * 前端 /asset-transfer 页提交；新使用人按工号优先精确匹配，回退按姓名解析（同交接模式）。
 */
@Data
public class EamAssetTransferSaveDTO {

    /** 资产 ID */
    private Long assetId;

    /** 新使用人姓名（可含工号后缀，如 "张三(M001)"，后端解析） */
    private String toUserName;

    /** 新使用人工号（可选，优先精确匹配） */
    private String toUserEmpId;

    /** 新归属部门 */
    private String toDepartment;

    /** 调拨日期 yyyy-MM-dd */
    private String transferDate;

    /** 调拨原因 */
    private String reason;

    /** 备注 */
    private String remark;
}
