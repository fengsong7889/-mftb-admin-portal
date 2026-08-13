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
import com.mftb.admin.entity.FinApproval;
import com.mftb.admin.mapper.BizGiftConsumeMapper;
import com.mftb.admin.mapper.BizGiftRecordMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.mapper.FinApprovalMapper;
import com.mftb.admin.service.GiftService;
import com.mftb.admin.service.WorkflowConfigService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
    private final FinApprovalMapper finApprovalMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;
    private final WorkflowConfigService workflowConfigService;

    @Override
    public PageResult<GiftRecordVO> listRecords(long page, long size, Long groupId, Long storeId, String brand, String adType) {
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);

        // 同一门店+同一广告类型的多笔赠送聚合为一行，逐笔记录在明细页查看
        List<GiftRecordVO> grouped = groupByStoreAdType(queryRecords(groupId, storeId, brand, adType));

        int total = grouped.size();
        int from = (int) Math.min((page - 1) * size, total);
        int to = (int) Math.min(from + size, total);
        List<GiftRecordVO> records = grouped.subList(from, to);
        enrichRecordGroupStore(records);
        return new PageResult<>(records, (long) total);
    }

    @Override
    public List<GiftRecordVO> listRecordsByStore(Long storeId, String adType) {
        List<BizGiftRecord> records = giftRecordMapper.selectList(
                new LambdaQueryWrapper<BizGiftRecord>()
                        .eq(BizGiftRecord::getStoreId, storeId)
                        .eq(BizGiftRecord::getAdType, adType)
                        .orderByDesc(BizGiftRecord::getId));
        List<GiftRecordVO> vos = records.stream().map(GiftRecordVO::from).toList();
        enrichRecordGroupStore(vos);
        return vos;
    }

    /** 按筛选条件查询全部赠送记录（最新在前） */
    private List<BizGiftRecord> queryRecords(Long groupId, Long storeId, String brand, String adType) {
        LambdaQueryWrapper<BizGiftRecord> wrapper = new LambdaQueryWrapper<>();
        if (groupId != null) wrapper.eq(BizGiftRecord::getGroupId, groupId);
        if (storeId != null) wrapper.eq(BizGiftRecord::getStoreId, storeId);
        if (StringUtils.hasText(brand)) wrapper.eq(BizGiftRecord::getBrand, brand);
        if (StringUtils.hasText(adType)) wrapper.eq(BizGiftRecord::getAdType, adType);
        wrapper.orderByDesc(BizGiftRecord::getId);
        return giftRecordMapper.selectList(wrapper);
    }

    /** 按门店+广告类型聚合：天数字段求和、记录笔数计数，组间按最新记录排序 */
    private List<GiftRecordVO> groupByStoreAdType(List<BizGiftRecord> records) {
        Map<String, List<BizGiftRecord>> groups = new LinkedHashMap<>();
        for (BizGiftRecord record : records) {
            groups.computeIfAbsent(record.getStoreId() + "|" + record.getAdType(), k -> new ArrayList<>())
                    .add(record);
        }
        return groups.values().stream().map(list -> {
            GiftRecordVO vo = GiftRecordVO.from(list.get(0)); // 最新一笔作为行基础信息
            int totalDays = 0;
            int usedDays = 0;
            int remainingDays = 0;
            for (BizGiftRecord r : list) {
                totalDays += r.getTotalDays() == null ? 0 : r.getTotalDays();
                usedDays += r.getUsedDays() == null ? 0 : r.getUsedDays();
                remainingDays += r.getRemainingDays() == null ? 0 : r.getRemainingDays();
            }
            vo.setTotalDays(totalDays);
            vo.setUsedDays(usedDays);
            vo.setRemainingDays(remainingDays);
            vo.setRecordCount(list.size());
            return vo;
        }).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public GiftRecordVO createRecord(GiftRecordRequest request) {
        BizMerchantGroup group = groupMapper.selectById(request.getGroupId());
        if (group == null) throw new BusinessException("集团不存在");
        BizStore store = storeMapper.selectById(request.getStoreId());
        if (store == null) throw new BusinessException("门店不存在");

        boolean needApproval = workflowConfigService.isApprovalEnabled("gift");
        String approvalNo = null;

        if (needApproval) {
            // 审批启用：创建审批流程记录，赠送记录关联审批编号
            String flowNo = bizSeqService.next(BizSeqService.flowRuleKey("gift"));
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("adType", request.getAdType());
            extra.put("giftDays", request.getGiftDays());
            extra.put("validDays", request.getValidDays());
            extra.put("reason", request.getReason());

            FinApproval approval = new FinApproval();
            approval.setFlowNo(flowNo);
            approval.setApprovalType("gift");
            approval.setGroupCode(String.valueOf(request.getGroupId()));
            approval.setGroupName(group.getGroupName());
            approval.setBrand(request.getBrand());
            approval.setApplicant(operatorResolver.operatorSignature(operatorResolver.currentUser()));
            approval.setApplyTime(LocalDateTime.now());
            approval.setBizApproveStatus("pending");
            approval.setOpsApproveStatus("pending");
            approval.setFinApproveStatus("pending");
            approval.setFlowStatus("pending");
            approval.setExtra(JsonUtils.toJson(extra));
            approval.setUpdatedBy(operatorResolver.currentOperatorName());
            finApprovalMapper.insert(approval);
            approvalNo = flowNo;
        }

        BizGiftRecord record = new BizGiftRecord();
        // 赠送ID按广告类型取对应编号规则（如 XDZS/RQZS/PHZS + 年月日 + 4位序号）
        String giftRuleKey = BizSeqService.giftRuleKey(request.getAdType());
        if (giftRuleKey == null) {
            throw new BusinessException("未知廣告類型，無法生成贈送ID: " + request.getAdType());
        }
        record.setGiftId(bizSeqService.next(giftRuleKey));
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
        record.setApprovalNo(approvalNo);
        record.setApplicant(operatorResolver.currentOperatorName());
        record.setApplyTime(LocalDateTime.now());
        // 审批启用=未审批(1)，审批停用=已审批(2)直接生效
        record.setApprovalStatus(needApproval ? 1 : 2);
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
    @Transactional(rollbackFor = Exception.class)
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
        page = PageResult.normalizePage(page);
        size = PageResult.normalizeSize(size);
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

    @Override
    public int availableDays(Long storeId, String adType) {
        return usableRecords(storeId, adType).stream()
                .mapToInt(r -> r.getRemainingDays() == null ? 0 : r.getRemainingDays())
                .sum();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deductForOrder(Long storeId, String adType, int days, String orderNo,
                               String algorithmId, String algorithmName) {
        if (storeId == null || !StringUtils.hasText(adType) || days <= 0) {
            return;
        }
        List<BizGiftRecord> records = usableRecords(storeId, adType);
        int total = records.stream().mapToInt(r -> r.getRemainingDays() == null ? 0 : r.getRemainingDays()).sum();
        if (total < days) {
            throw new BusinessException("贈送天數餘額不足，當前可用 " + total + " 天");
        }
        int remaining = days;
        for (BizGiftRecord record : records) {
            if (remaining <= 0) {
                break;
            }
            int balance = record.getRemainingDays() == null ? 0 : record.getRemainingDays();
            if (balance <= 0) {
                continue;
            }
            int deduct = Math.min(balance, remaining);
            record.setUsedDays((record.getUsedDays() == null ? 0 : record.getUsedDays()) + deduct);
            record.setRemainingDays(balance - deduct);
            if (record.getRemainingDays() == 0) {
                record.setStatus(2); // 已用完
            }
            record.setUpdatedBy(operatorResolver.currentOperatorName());
            giftRecordMapper.updateById(record);

            BizGiftConsume consume = new BizGiftConsume();
            consume.setGiftRecordId(record.getId());
            consume.setGiftId(record.getGiftId());
            consume.setGroupId(record.getGroupId());
            consume.setGroupName(record.getGroupName());
            consume.setStoreId(record.getStoreId());
            consume.setStoreName(record.getStoreName());
            consume.setBrand(record.getBrand());
            consume.setAdType(record.getAdType());
            consume.setTradeType("ad_purchase");
            consume.setBalanceChange(-deduct);
            consume.setChangeDate(LocalDate.now());
            consume.setAlgorithmId(algorithmId);
            consume.setAlgorithmName(algorithmName);
            consume.setOrderNo(orderNo);
            consume.setRemainingDays(record.getRemainingDays());
            consume.setRemark("廣告購買抵扣 訂單" + (orderNo == null ? "" : orderNo));
            giftConsumeMapper.insert(consume);
            remaining -= deduct;
        }
    }

    /** 门店在指定广告类型下可用赠送记录（可用、未过期、有余额），按到期时间升序（FIFO） */
    private List<BizGiftRecord> usableRecords(Long storeId, String adType) {
        return giftRecordMapper.selectList(
                new LambdaQueryWrapper<BizGiftRecord>()
                        .eq(BizGiftRecord::getStoreId, storeId)
                        .eq(BizGiftRecord::getAdType, adType)
                        .eq(BizGiftRecord::getStatus, 1)
                        .gt(BizGiftRecord::getRemainingDays, 0)
                        .ge(BizGiftRecord::getExpireDate, LocalDate.now())
                        .orderByAsc(BizGiftRecord::getExpireDate)
                        .orderByAsc(BizGiftRecord::getId));
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
}
