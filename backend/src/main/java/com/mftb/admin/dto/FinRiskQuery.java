package com.mftb.admin.dto;

import lombok.Getter;
import lombok.Setter;

/**
 * 消费风控列表查询条件（消费风控菜单搜索区）
 */
@Getter
@Setter
public class FinRiskQuery extends FinPageQuery {

    /** 集团ID（模糊匹配） */
    private String groupId;

    /** 集团名称（模糊匹配） */
    private String groupName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 风控模式: repay=还款释放 monthly=每月比例释放 */
    private String releaseMode;

    /** 账户状态（与账户余额菜单同步）: normal / frozen / mergeFrozen / cancelled */
    private String accountStatus;

    /** 最后更新人（模糊匹配） */
    private String updatedBy;

    /** 最后更新时间起 YYYY-MM-DD */
    private String updatedFrom;

    /** 最后更新时间止 YYYY-MM-DD */
    private String updatedTo;
}
