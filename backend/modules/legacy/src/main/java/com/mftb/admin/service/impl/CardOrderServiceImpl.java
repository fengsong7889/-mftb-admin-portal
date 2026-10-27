package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysCardOrder;
import com.mftb.admin.mapper.SysCardOrderMapper;
import com.mftb.admin.service.CardOrderService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collections;
import java.util.List;

/**
 * 卡片排序服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CardOrderServiceImpl implements CardOrderService {

    private final SysCardOrderMapper cardOrderMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public List<Integer> getOrder(String menuKey, String tabKey) {
        LambdaQueryWrapper<SysCardOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysCardOrder::getMenuKey, menuKey)
               .eq(SysCardOrder::getTabKey, tabKey);
        SysCardOrder record = cardOrderMapper.selectOne(wrapper);
        if (record == null || record.getCardOrder() == null) {
            return Collections.emptyList();
        }
        try {
            return JsonUtils.parseIntList(record.getCardOrder());
        } catch (Exception e) {
            log.warn("解析卡片排序失败: menuKey={}, tabKey={}", menuKey, tabKey, e);
            return Collections.emptyList();
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void saveOrder(String menuKey, String tabKey, List<Integer> order) {
        LambdaQueryWrapper<SysCardOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysCardOrder::getMenuKey, menuKey)
               .eq(SysCardOrder::getTabKey, tabKey);
        SysCardOrder existing = cardOrderMapper.selectOne(wrapper);

        String orderJson = JsonUtils.toJson(order);
        String operator = operatorResolver.currentOperatorName();

        if (existing != null) {
            existing.setCardOrder(orderJson);
            existing.setUpdatedBy(operator);
            cardOrderMapper.updateById(existing);
        } else {
            SysCardOrder record = new SysCardOrder();
            record.setMenuKey(menuKey);
            record.setTabKey(tabKey);
            record.setCardOrder(orderJson);
            record.setUpdatedBy(operator);
            cardOrderMapper.insert(record);
        }
    }
}
