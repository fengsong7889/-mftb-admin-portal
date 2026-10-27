package com.mftb.admin.dto;

import lombok.Data;

/**
 * 赔付记录查询参数
 */
@Data
public class EamCompensationQuery {
    /** 页码 */
    private Integer page = 1;
    /** 每页大小 */
    private Integer size = 10;
    /** 关键词（兼容保留：赔付单号/资产编号/持有人） */
    private String keyword;
    /** 赔付单号（模糊） */
    private String compNo;
    /** 资产名称（模糊） */
    private String assetName;
    /** 原持有人（模糊） */
    private String holderName;
    /** 状态：pending/confirmed/partially_paid/paid/waived/refund_pending */
    private String status;
    /** 损失类型：damage/loss */
    private String damageType;
    /** 责任对象：employee/department/company/none */
    private String party;
    /** 是否需要找回复核 */
    private Boolean reviewRequired;
    /** 所属品牌（sys_company_brand.id） */
    private Integer companyBrand;
}
