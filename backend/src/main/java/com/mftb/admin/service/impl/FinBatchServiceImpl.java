package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;
import com.mftb.admin.dto.FinBatchQuery;
import com.mftb.admin.dto.FinBatchVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.FinBatch;
import com.mftb.admin.mapper.FinBatchMapper;
import com.mftb.admin.service.FinBatchService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 批次查询服务实现
 */
@Service
@RequiredArgsConstructor
public class FinBatchServiceImpl implements FinBatchService {

    private final FinBatchMapper batchMapper;

    @Override
    public PageResult<FinBatchVO> page(FinBatchQuery query) {
        LambdaQueryWrapper<FinBatch> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getGroupId())) {
            wrapper.like(FinBatch::getGroupCode, query.getGroupId());
        }
        if (StringUtils.hasText(query.getGroupName())) {
            wrapper.like(FinBatch::getGroupName, query.getGroupName());
        }
        if (StringUtils.hasText(query.getBrand())) {
            wrapper.eq(FinBatch::getBrand, query.getBrand());
        }
        if (StringUtils.hasText(query.getBatchType())) {
            wrapper.eq(FinBatch::getBatchType, query.getBatchType());
        }
        if (StringUtils.hasText(query.getBatchNo())) {
            wrapper.like(FinBatch::getBatchNo, query.getBatchNo());
        }
        if (StringUtils.hasText(query.getFlowNo())) {
            wrapper.like(FinBatch::getFlowNo, query.getFlowNo());
        }
        if (StringUtils.hasText(query.getIsActual())) {
            wrapper.eq(FinBatch::getIsActual, query.getIsActual());
        }
        if (StringUtils.hasText(query.getApplicant())) {
            wrapper.like(FinBatch::getApplicant, query.getApplicant());
        }
        if (StringUtils.hasText(query.getBd())) {
            wrapper.like(FinBatch::getBd, query.getBd());
        }
        if (query.tradeFromTime() != null) {
            wrapper.ge(FinBatch::getTradeTime, query.tradeFromTime());
        }
        if (query.tradeToTime() != null) {
            wrapper.lt(FinBatch::getTradeTime, query.tradeToTime());
        }
        wrapper.orderByDesc(FinBatch::getTradeTime).orderByDesc(FinBatch::getId);

        Page<FinBatch> result = batchMapper.selectPage(new Page<>(query.getPage(), query.getSize()), wrapper);
        List<FinBatchVO> records = result.getRecords().stream().map(FinBatchVO::from).toList();
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public FinBatchVO detail(String batchNo, String groupId) {
        LambdaQueryWrapper<FinBatch> wrapper = new LambdaQueryWrapper<FinBatch>()
                .eq(FinBatch::getBatchNo, batchNo);
        if (StringUtils.hasText(groupId)) {
            wrapper.eq(FinBatch::getGroupCode, groupId);
        }
        wrapper.orderByAsc(FinBatch::getId).last("LIMIT 1");
        FinBatch batch = batchMapper.selectOne(wrapper);
        if (batch == null) {
            throw new BusinessException(ResultCode.NOT_FOUND.getCode(), "批次不存在: " + batchNo);
        }
        return FinBatchVO.from(batch);
    }
}
