package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 卡片排序保存请求（按菜单+Tab维度全局共享）
 */
@Data
public class CardOrderSaveDTO {

    /** 卡片 ID 顺序 */
    private List<Integer> order;
}
