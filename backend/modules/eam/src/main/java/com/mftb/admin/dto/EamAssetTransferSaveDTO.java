package com.mftb.admin.dto;

import lombok.Data;
import jakarta.validation.constraints.*;

/**
 * 资产调拨登记请求 DTO
 * <p>
 * 前端 /asset-transfer 页提交；新使用人按工号优先精确匹配，回退按姓名解析（同交接模式）。
 */
@Data
public class EamAssetTransferSaveDTO {

    /** 资产 ID */
    @NotNull @Positive
    private Long assetId;

    @NotNull @Positive
    private Long toUserId;
    @NotNull @Positive
    private Long toDepartmentId;
    @NotNull @PositiveOrZero
    private Long expectedVersion;
    @NotBlank @Pattern(regexp = "[a-zA-Z0-9-]{16,64}")
    private String requestKey;

    /** 新使用人姓名（可含工号后缀，如 "张三(M001)"，后端解析） */
    private String toUserName;

    /** 新使用人工号（可选，优先精确匹配） */
    private String toUserEmpId;

    /** 新归属部门 */
    private String toDepartment;

    /** 调拨日期 yyyy-MM-dd */
    @NotBlank
    private String transferDate;

    /** 调拨原因 */
    @NotBlank @Size(max = 500)
    private String reason;

    /** 备注 */
    @Size(max = 512)
    private String remark;
}
