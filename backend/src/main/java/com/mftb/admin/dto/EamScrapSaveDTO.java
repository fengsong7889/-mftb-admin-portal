package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;

/**
 * 报废记录创建参数
 * <p>
 * 资产快照字段（编号/名称/分类/品牌）由服务端根据 assetId 读取资产台账生成，前端无需传入。
 */
@Data
public class EamScrapSaveDTO {
    /** 资产 ID */
    private Long assetId;
    /** 报废日期 yyyy-MM-dd */
    private String scrapDate;
    /** 申请人 */
    private String applyBy;
    /** 申请人工号 */
    private String empId;
    /** 报废原因 */
    private String reason;
    /** 残值（MOP） */
    private BigDecimal residualValue;
    /** 处置方式：sale/donate/recycle/destroy */
    private String disposeType;
    /** 鉴定意见 */
    private String appraisal;
    /** 备注 */
    private String remark;
}
