package com.mftb.admin.service;

import java.util.List;

/**
 * 卡片排序服务
 */
public interface CardOrderService {

    /** 获取指定菜单+Tab的卡片排序，不存在时返回空列表 */
    List<Integer> getOrder(String menuKey, String tabKey);

    /** 保存指定菜单+Tab的卡片排序 */
    void saveOrder(String menuKey, String tabKey, List<Integer> order);
}
