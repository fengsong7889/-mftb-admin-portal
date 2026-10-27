package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.StoreDataConfigDTO;
import com.mftb.admin.entity.BizStoreDataConfig;
import com.mftb.admin.mapper.BizStoreDataConfigMapper;
import com.mftb.admin.service.StoreDataConfigService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 门店金字招牌数据配置服务实现
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StoreDataConfigServiceImpl implements StoreDataConfigService {

    private final BizStoreDataConfigMapper storeDataConfigMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public StoreDataConfigDTO getConfig(Long storeId) {
        BizStoreDataConfig entity = selectByStoreId(storeId);
        if (entity == null) {
            // 门店尚无配置：按 storeId 种子确定性随机预生成并落库，免去手工配置
            StoreDataConfigDTO generated = StoreDataConfigService.generate(storeId);
            entity = toEntity(storeId, generated);
            entity.setUpdatedBy("系統預生成");
            storeDataConfigMapper.insert(entity);
            log.info("已为门店 {} 预生成金字招牌数据配置", storeId);
            return generated;
        }
        return toDto(entity);
    }

    @Override
    public void updateConfig(Long storeId, StoreDataConfigDTO dto) {
        BizStoreDataConfig entity = selectByStoreId(storeId);
        if (entity == null) {
            entity = toEntity(storeId, dto);
            entity.setUpdatedBy(operatorResolver.currentOperatorName());
            storeDataConfigMapper.insert(entity);
        } else {
            applyDto(entity, dto);
            entity.setUpdatedBy(operatorResolver.currentOperatorName());
            storeDataConfigMapper.updateById(entity);
        }
        log.info("门店 {} 金字招牌数据配置已更新", storeId);
    }

    private BizStoreDataConfig selectByStoreId(Long storeId) {
        return storeDataConfigMapper.selectOne(
                new LambdaQueryWrapper<BizStoreDataConfig>()
                        .eq(BizStoreDataConfig::getStoreId, storeId));
    }

    private BizStoreDataConfig toEntity(Long storeId, StoreDataConfigDTO dto) {
        BizStoreDataConfig entity = new BizStoreDataConfig();
        entity.setStoreId(storeId);
        applyDto(entity, dto);
        return entity;
    }

    private void applyDto(BizStoreDataConfig entity, StoreDataConfigDTO dto) {
        entity.setMonthlyOrders(dto.getMonthlyOrders());
        entity.setMonthlyRepurchaseOrders(dto.getMonthlyRepurchaseOrders());
        entity.setMonthlyPositiveOrders(dto.getMonthlyPositiveOrders());
        entity.setMonthlyVisits(dto.getMonthlyVisits());
        entity.setStoreFavorites(dto.getStoreFavorites());
        entity.setMonthlyCustomers(dto.getMonthlyCustomers());
    }

    private StoreDataConfigDTO toDto(BizStoreDataConfig entity) {
        StoreDataConfigDTO dto = new StoreDataConfigDTO();
        dto.setMonthlyOrders(entity.getMonthlyOrders());
        dto.setMonthlyRepurchaseOrders(entity.getMonthlyRepurchaseOrders());
        dto.setMonthlyPositiveOrders(entity.getMonthlyPositiveOrders());
        dto.setMonthlyVisits(entity.getMonthlyVisits());
        dto.setStoreFavorites(entity.getStoreFavorites());
        dto.setMonthlyCustomers(entity.getMonthlyCustomers());
        return dto;
    }
}
