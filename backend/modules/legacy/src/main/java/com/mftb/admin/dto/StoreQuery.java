package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * 门店列表查询条件
 */
@Getter
@Setter
public class StoreQuery extends AuditPageQuery {

    /** 所属集团ID（精确匹配，供指定集团查询使用） */
    private Long groupId;

    /** 所属集团ID/名称（模糊匹配） */
    private String groupKeyword;

    /** 门店ID/名称（模糊匹配） */
    private String keyword;

    /** 所属品牌 */
    private String brand;

    /** 业务频道 */
    private String bizChannel;
}
