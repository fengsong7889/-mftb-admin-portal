package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.GiftConsumeVO;
import com.mftb.admin.dto.GiftDeductRequest;
import com.mftb.admin.dto.GiftRecordRequest;
import com.mftb.admin.dto.GiftRecordVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.BizGiftConsume;
import com.mftb.admin.entity.BizGiftRecord;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.mapper.BizGiftConsumeMapper;
import com.mftb.admin.mapper.BizGiftRecordMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.GiftService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 赠送管理服务实现
 */
@Service
@RequiredArgsConstructor
public class GiftServiceImpl implements GiftService {

    private final BizGiftRecordMapper giftRecordMapper;
    private final BizGiftConsumeMapper giftConsumeMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<GiftRecordVO> listRecords(long page, long size, Long groupId, Long storeId, String brand, String adType) {
        LambdaQueryWrapper<BizGiftRecord> wrapper = new LambdaQueryWrapper<>();
        if (groupId != null) wrapper.eq(BizGiftRecord::getGroupId, groupId);
        if (storeId != null) wrapper.eq(BizGiftRecord::getStoreId, storeId);
        if (StringUtils.hasText(brand)) wrapper.eq(BizGiftRecord::getBrand, brand);
        if (StringUtils.hasText(adType)) wrapper.eq(BizGiftRecord::getAdType, adType);
        wrapper.orderByDesc(BizGiftRecord::getId);

        Page<BizGiftRecord> pageResult = giftRecordMapper.selectPage(new Page<>(page, size), wrapper);
        List<GiftRecordVO> records = pageResult.getRecords().stream()
                .map(GiftRecordVO::from)
                .toList();
        enrichRecordGroupStore(records);
        return new PageResult<>(records, pageResult.getTotal());
    }

    @Override
    public GiftRecordVO createRecord(GiftRecordRequest request) {
        BizMerchantGroup group = groupMapper.selectById(request.getGroupId());
        if (group == null) throw new BusinessException("集团不存在");
        BizStore store = storeMapper.selectById(request.getStoreId());
        if (store == null) throw new BusinessException("门店不存在");

        BizGiftRecord record = new BizGiftRecord();
        record.setGiftId(generateGiftId());
        record.setGroupId(request.getGroupId());
        record.setGroupName(group.getGroupName());
        record.setStoreId(request.getStoreId());
        record.setStoreName(store.getStoreName());
        record.setBrand(request.getBrand());
        record.setAdType(request.getAdType());
        record.setTotalDays(request.getGiftDays());
        record.setValidDays(request.getValidDays());
        record.setUsedDays(0);
        record.setRemainingDays(request.getGiftDays());
        record.setGiftDate(LocalDate.now());
        record.setExpireDate(LocalDate.now().plusDays(request.getValidDays()));
        record.setStatus(1); // 可用
        record.setReason(request.getReason());
        record.setCredentials(JsonUtils.toJson(request.getCredentials()));
        record.setApplicant(operatorResolver.currentOperatorName());
        record.setApplyTime(LocalDateTime.now());
        record.setApprovalStatus(1); // 未审批
        record.setUpdatedBy(operatorResolver.currentOperatorName());
        record.setDeleted(0);
        giftRecordMapper.insert(record);
        GiftRecordVO vo = GiftRecordVO.from(record);
        enrichRecordGroupStore(List.of(vo));
        return vo;
    }

    @Override
    public GiftRecordVO getRecordDetail(Long id) {
        BizGiftRecord record = giftRecordMapper.selectById(id);
        if (record == null) throw new BusinessException("赠送记录不存在");
        GiftRecordVO vo = GiftRecordVO.from(record);
        enrichRecordGroupStore(List.of(vo));
        return vo;
    }

    @Override
    @Transactional
    public void deductDays(Long id, GiftDeductRequest request) {
        BizGiftRecord record = giftRecordMapper.selectById(id);
        if (record == null) throw new BusinessException("赠送记录不存在");
        if (record.getRemainingDays() < request.getDeductDays()) {
            throw new BusinessException("扣除天数不能超过剩余天数 " + record.getRemainingDays());
        }

        // 更新赠送记录
        record.setUsedDays(record.getUsedDays() + request.getDeductDays());
        record.setRemainingDays(record.getRemainingDays() - request.getDeductDays());
        if (record.getRemainingDays() == 0) {
            record.setStatus(2); // 已用完
        }
        record.setUpdatedBy(operatorResolver.currentOperatorName());
        giftRecordMapper.updateById(record);

        // 写入消费流水
        BizGiftConsume consume = new BizGiftConsume();
        consume.setGiftRecordId(id);
        consume.setGiftId(record.getGiftId());
        consume.setGroupId(record.getGroupId());
        consume.setGroupName(record.getGroupName());
        consume.setStoreId(record.getStoreId());
        consume.setStoreName(record.getStoreName());
        consume.setBrand(record.getBrand());
        consume.setAdType(record.getAdType());
        consume.setTradeType("manual_deduct");
        consume.setBalanceChange(-request.getDeductDays());
        consume.setChangeDate(LocalDate.now());
        consume.setRemainingDays(record.getRemainingDays());
        consume.setRemark(request.getReason());
        giftConsumeMapper.insert(consume);
    }

    @Override
    public PageResult<GiftConsumeVO> listConsume(long page, long size, Long groupId, Long storeId,
                                                  String brand, String adType, String tradeType,
                                                  String giftId, String orderNo, String algorithmId,
                                                  String startDate, String endDate) {
        LambdaQueryWrapper<BizGiftConsume> wrapper = new LambdaQueryWrapper<>();
        if (groupId != null) wrapper.eq(BizGiftConsume::getGroupId, groupId);
        if (storeId != null) wrapper.eq(BizGiftConsume::getStoreId, storeId);
        if (StringUtils.hasText(brand)) wrapper.eq(BizGiftConsume::getBrand, brand);
        if (StringUtils.hasText(adType)) wrapper.eq(BizGiftConsume::getAdType, adType);
        if (StringUtils.hasText(tradeType)) wrapper.eq(BizGiftConsume::getTradeType, tradeType);
        if (StringUtils.hasText(giftId)) wrapper.like(BizGiftConsume::getGiftId, giftId);
        if (StringUtils.hasText(orderNo)) wrapper.like(BizGiftConsume::getOrderNo, orderNo);
        if (StringUtils.hasText(algorithmId)) wrapper.like(BizGiftConsume::getAlgorithmId, algorithmId);
        if (StringUtils.hasText(startDate)) wrapper.ge(BizGiftConsume::getChangeDate, LocalDate.parse(startDate));
        if (StringUtils.hasText(endDate)) wrapper.le(BizGiftConsume::getChangeDate, LocalDate.parse(endDate));
        wrapper.orderByDesc(BizGiftConsume::getId);

        Page<BizGiftConsume> pageResult = giftConsumeMapper.selectPage(new Page<>(page, size), wrapper);
        List<GiftConsumeVO> records = pageResult.getRecords().stream()
                .map(GiftConsumeVO::from)
                .toList();
        enrichConsumeGroupStore(records);
        return new PageResult<>(records, pageResult.getTotal());
    }

    /** 列表补充真实集团/门店数据: 业务编号 + 最新名称 (已删除的保留快照名称) */
    private void enrichRecordGroupStore(List<GiftRecordVO> records) {
        Map<Long, BizMerchantGroup> groupMap = groupMapByIds(
                records.stream().map(GiftRecordVO::getGroupId).collect(Collectors.toSet()));
        Map<Long, BizStore> storeMap = storeMapByIds(
                records.stream().map(GiftRecordVO::getStoreId).collect(Collectors.toSet()));
        for (GiftRecordVO vo : records) {
            BizMerchantGroup group = groupMap.get(vo.getGroupId());
            if (group != null) {
                vo.setGroupCode(group.getGroupCode());
                vo.setGroupName(group.getGroupName());
            }
            BizStore store = storeMap.get(vo.getStoreId());
            if (store != null) {
                vo.setStoreCode(store.getStoreCode());
                vo.setStoreName(store.getStoreName());
            }
        }
    }

    /** 消费流水补充真实集团/门店数据 */
    private void enrichConsumeGroupStore(List<GiftConsumeVO> records) {
        Map<Long, BizMerchantGroup> groupMap = groupMapByIds(
                records.stream().map(GiftConsumeVO::getGroupId).collect(Collectors.toSet()));
        Map<Long, BizStore> storeMap = storeMapByIds(
                records.stream().map(GiftConsumeVO::getStoreId).collect(Collectors.toSet()));
        for (GiftConsumeVO vo : records) {
            BizMerchantGroup group = groupMap.get(vo.getGroupId());
            if (group != null) {
                vo.setGroupCode(group.getGroupCode());
                vo.setGroupName(group.getGroupName());
            }
            BizStore store = storeMap.get(vo.getStoreId());
            if (store != null) {
                vo.setStoreCode(store.getStoreCode());
                vo.setStoreName(store.getStoreName());
            }
        }
    }

    private Map<Long, BizMerchantGroup> groupMapByIds(Collection<Long> ids) {
        Set<Long> validIds = new HashSet<>();
        for (Long id : ids) {
            if (id != null) validIds.add(id);
        }
        if (validIds.isEmpty()) return Map.of();
        return groupMapper.selectBatchIds(validIds).stream()
                .collect(Collectors.toMap(BizMerchantGroup::getId, Function.identity()));
    }

    private Map<Long, BizStore> storeMapByIds(Collection<Long> ids) {
        Set<Long> validIds = new HashSet<>();
        for (Long id : ids) {
            if (id != null) validIds.add(id);
        }
        if (validIds.isEmpty()) return Map.of();
        return storeMapper.selectBatchIds(validIds).stream()
                .collect(Collectors.toMap(BizStore::getId, Function.identity()));
    }

    /** 生成赠送ID: 格式 YYMM-序号 */
    private String generateGiftId() {
        String prefix = LocalDate.now().format(DateTimeFormatter.ofPattern("yyMM"));
        // 查询当月最大序号
        LambdaQueryWrapper<BizGiftRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.likeRight(BizGiftRecord::getGiftId, prefix + "-")
                .orderByDesc(BizGiftRecord::getGiftId)
                .last("LIMIT 1");
        BizGiftRecord last = giftRecordMapper.selectOne(wrapper);
        int seq = 1;
        if (last != null && last.getGiftId() != null) {
            try {
                String lastSeq = last.getGiftId().substring(last.getGiftId().lastIndexOf('-') + 1);
                seq = Integer.parseInt(lastSeq) + 1;
            } catch (Exception ignored) {
            }
        }
        return prefix + "-" + String.format("%03d", seq);
    }
}
