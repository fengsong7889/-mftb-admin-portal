package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * 推广金账户列表查询条件（账户余额菜单搜索区）
 */
@Getter
@Setter
public class FinAccountQuery extends FinPageQuery {

    /** 集团ID（模糊匹配） */
    private String groupId;

    /** 集团名称（模糊匹配） */
    private String groupName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 账户状态: normal / frozen / mergeFrozen / cancelled */
    private String status;
}
