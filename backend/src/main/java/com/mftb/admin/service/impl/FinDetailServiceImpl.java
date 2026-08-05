package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.dto.FinDetailQuery;
import com.mftb.admin.dto.FinDetailVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.FinDetail;
import com.mftb.admin.mapper.FinDetailMapper;
import com.mftb.admin.service.FinDetailService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.List;

/**
 * 交易明细查询服务实现
 */
@Service
@RequiredArgsConstructor
public class FinDetailServiceImpl implements FinDetailService {

    private final FinDetailMapper detailMapper;

    @Override
    public PageResult<FinDetailVO> page(FinDetailQuery query) {
        LambdaQueryWrapper<FinDetail> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getGroupId())) {
            wrapper.like(FinDetail::getGroupCode, query.getGroupId());
        }
        if (StringUtils.hasText(query.getGroupName())) {
            wrapper.like(FinDetail::getGroupName, query.getGroupName());
        }
        if (StringUtils.hasText(query.getBrand())) {
            wrapper.eq(FinDetail::getBrand, query.getBrand());
        }
        if (StringUtils.hasText(query.getStoreId())) {
            wrapper.like(FinDetail::getStoreCode, query.getStoreId());
        }
        if (StringUtils.hasText(query.getStoreName())) {
            wrapper.like(FinDetail::getStoreName, query.getStoreName());
        }
        if (StringUtils.hasText(query.getChannel())) {
            wrapper.eq(FinDetail::getChannel, query.getChannel());
        }
        if (StringUtils.hasText(query.getTradeType())) {
            // 展示口径: 退款=正数消费明细，消费=非正数消费明细（存储均为「消費」）
            if ("退款".equals(query.getTradeType())) {
                wrapper.eq(FinDetail::getTradeType, "消費")
                        .gt(FinDetail::getVirtualChange, BigDecimal.ZERO);
            } else if ("消費".equals(query.getTradeType())) {
                wrapper.eq(FinDetail::getTradeType, "消費")
                        .le(FinDetail::getVirtualChange, BigDecimal.ZERO);
            } else {
                wrapper.eq(FinDetail::getTradeType, query.getTradeType());
            }
        }
        if (StringUtils.hasText(query.getChangeType())) {
            wrapper.eq(FinDetail::getChangeType, query.getChangeType());
        }
        if (StringUtils.hasText(query.getBatchNo())) {
            wrapper.like(FinDetail::getBatchNo, query.getBatchNo());
        }
        if (StringUtils.hasText(query.getFlowNo())) {
            wrapper.like(FinDetail::getFlowNo, query.getFlowNo());
        }
        if (StringUtils.hasText(query.getDetailId())) {
            wrapper.like(FinDetail::getDetailId, query.getDetailId());
        }
        if (query.tradeFromTime() != null) {
            wrapper.ge(FinDetail::getTradeTime, query.tradeFromTime());
        }
        if (query.tradeToTime() != null) {
            wrapper.lt(FinDetail::getTradeTime, query.tradeToTime());
        }
        wrapper.orderByDesc(FinDetail::getTradeTime).orderByDesc(FinDetail::getId);

        long p = PageResult.normalizePage(query.getPage());
        long sz = PageResult.normalizeSize(query.getSize());
        Page<FinDetail> result = detailMapper.selectPage(new Page<>(p, sz), wrapper);
        List<FinDetailVO> records = result.getRecords().stream().map(FinDetailVO::from).toList();
        return new PageResult<>(records, result.getTotal());
    }
}
