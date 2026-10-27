package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * 集团列表查询条件
 */
@Getter
@Setter
public class MerchantGroupQuery extends AuditPageQuery {

    /** 集团ID/名称（模糊匹配） */
    private String keyword;
}
