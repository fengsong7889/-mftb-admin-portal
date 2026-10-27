package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AdCellQuota;
import com.mftb.admin.mapper.AdCellQuotaMapper;
import com.mftb.admin.service.AdCellQuotaService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

/**
 * 广告格子占用计数器服务实现
 * <p>
 * 占位采用「INSERT 新格子 / UPDATE 旧格子」两段式：
 * 先尝试插入 taken=1 的新计数行（首次售出），唯一键冲突则对已有行做
 * 受 taken &lt; limit 约束的原子自增。两条路径都在行锁保护下执行，
 * 并发下单不可能突破每日限量；失败随外层下单事务一并回滚。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AdCellQuotaServiceImpl implements AdCellQuotaService {

    private final AdCellQuotaMapper cellQuotaMapper;

    @Override
    public void takeCell(String module, LocalDate bizDate, Integer region, String mealSlot, int limit) {
        // 首次售出: 直接插入计数行 taken=1
        AdCellQuota quota = new AdCellQuota();
        quota.setModule(module);
        quota.setBizDate(bizDate);
        quota.setRegion(region);
        quota.setMealSlot(mealSlot == null ? "" : mealSlot);
        quota.setTaken(1);
        try {
            cellQuotaMapper.insert(quota);
            return;
        } catch (DuplicateKeyException e) {
            // 格子已有计数行 → 走原子自增
        }
        // 已有计数行: taken < limit 才自增, 0 行表示已售罄
        if (cellQuotaMapper.tryIncrement(module, bizDate, region, quota.getMealSlot(), limit) == 0) {
            log.warn("格子占位失败(已达每日限量): module={}, date={}, region={}, mealSlot={}, limit={}",
                    module, bizDate, region, quota.getMealSlot(), limit);
            throw new BusinessException("部分格子已售罄，請刷新後重新選擇");
        }
    }

    @Override
    public void releaseCell(String module, LocalDate bizDate, Integer region, String mealSlot) {
        cellQuotaMapper.decrement(module, bizDate, region, mealSlot == null ? "" : mealSlot);
    }
}
