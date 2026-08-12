package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdNewStoreInventoryVO;
import com.mftb.admin.dto.AdNewStoreOrderRequest;
import com.mftb.admin.dto.AdOrderVO;
import com.mftb.admin.entity.AdAlgorithm;
import com.mftb.admin.entity.AdOrder;
import com.mftb.admin.entity.AdOrderItemNewStore;
import com.mftb.admin.entity.BizGiftRecord;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AdAlgorithmMapper;
import com.mftb.admin.mapper.AdOrderItemNewStoreMapper;
import com.mftb.admin.mapper.AdOrderMapper;
import com.mftb.admin.mapper.BizGiftRecordMapper;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.AdSalesNewStoreService;
import com.mftb.admin.service.GiftService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 新店广告销售服务实现（赠送天数查询 + 下单抵扣）
 * <p>
 * 新店广告与无敌星星/盘活复苏的核心区别: 无商圈/定价/推广金扣款，
 * 纯粹使用赠送天数抵扣，实付为 $0。
 */
@Service
@RequiredArgsConstructor
public class AdSalesNewStoreServiceImpl implements AdSalesNewStoreService {

    /** 赠送管理中新店广告的广告类型标识（biz_gift_record.ad_type） */
    public static final String GIFT_AD_TYPE = "new_store";

    private final AdAlgorithmMapper algorithmMapper;
    private final AdOrderMapper orderMapper;
    private final AdOrderItemNewStoreMapper itemMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final BizStoreMapper storeMapper;
    private final BizGiftRecordMapper giftRecordMapper;
    private final GiftService giftService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /* ==================== 库存（赠送天数余额）查询 ==================== */

    @Override
    public AdNewStoreInventoryVO inventory(Long algoId, String storeCode) {
        AdAlgorithm algorithm = requireActiveAlgorithm(algoId);
        BizStore store = requireStore(storeCode);

        // 查询该门店在该广告类型下的全部赠送记录
        List<BizGiftRecord> allRecords = giftRecordMapper.selectList(
                new LambdaQueryWrapper<BizGiftRecord>()
                        .eq(BizGiftRecord::getStoreId, store.getId())
                        .eq(BizGiftRecord::getAdType, GIFT_AD_TYPE));

        int totalGiftDays = allRecords.stream()
                .mapToInt(r -> r.getTotalDays() == null ? 0 : r.getTotalDays()).sum();
        int usedGiftDays = allRecords.stream()
                .mapToInt(r -> r.getUsedDays() == null ? 0 : r.getUsedDays()).sum();

        // 可用天数（状态=可用、未过期、有余额）
        int remainingGiftDays = giftService.availableDays(store.getId(), GIFT_AD_TYPE);

        // 有效期止: 可用记录中最晚的到期日
        String expireDate = allRecords.stream()
                .filter(r -> r.getStatus() != null && r.getStatus() == 1
                        && r.getExpireDate() != null
                        && !r.getExpireDate().isBefore(LocalDate.now())
                        && (r.getRemainingDays() == null ? 0 : r.getRemainingDays()) > 0)
                .map(BizGiftRecord::getExpireDate)
                .max(LocalDate::compareTo)
                .map(Object::toString)
                .orElse(null);

        AdNewStoreInventoryVO vo = new AdNewStoreInventoryVO();
        vo.setAlgoId(algoId);
        vo.setAlgoName(algorithm.getAlgoName());
        vo.setBrand(algorithm.getBrand());
        vo.setStoreCode(store.getStoreCode());
        vo.setStoreName(store.getStoreName());
        vo.setTotalGiftDays(totalGiftDays);
        vo.setUsedGiftDays(usedGiftDays);
        vo.setRemainingGiftDays(remainingGiftDays);
        vo.setExpireDate(expireDate);
        return vo;
    }

    /* ==================== 下单扣款 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdOrderVO placeOrder(AdNewStoreOrderRequest request) {
        AdAlgorithm algorithm = requireActiveAlgorithm(request.getAlgoId());
        if (algorithm.getAlgoType() != 2) {
            throw new BusinessException("該算法不是新店廣告類型");
        }
        BizStore store = requireStore(request.getStoreCode());
        String brand = algorithm.getBrand();

        // 1. 查询赠送天数余额
        int available = giftService.availableDays(store.getId(), GIFT_AD_TYPE);

        // 2. 日期去重 + 校验
        LocalDate today = LocalDate.now();
        Set<LocalDate> seen = new HashSet<>();
        for (AdNewStoreOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate() == null) {
                throw new BusinessException("日期信息不完整");
            }
            if (cell.getBizDate().isBefore(today)) {
                throw new BusinessException("購買日期不能早於今天");
            }
            if (!seen.add(cell.getBizDate())) {
                throw new BusinessException("選購日期重複");
            }
        }

        int giftDays = request.getCells().size();
        if (available < giftDays) {
            throw new BusinessException("贈送天數餘額不足，當前可用 " + available + " 天");
        }

        // 3. 有效期校验
        LocalDate expireDate = giftRecordMapper.selectList(
                new LambdaQueryWrapper<BizGiftRecord>()
                        .eq(BizGiftRecord::getStoreId, store.getId())
                        .eq(BizGiftRecord::getAdType, GIFT_AD_TYPE)
                        .eq(BizGiftRecord::getStatus, 1)
                        .gt(BizGiftRecord::getRemainingDays, 0)
                        .ge(BizGiftRecord::getExpireDate, today)
                        .orderByDesc(BizGiftRecord::getExpireDate)
                        .last("LIMIT 1"))
                .stream().findFirst().map(r -> r.getExpireDate()).orElse(null);
        if (expireDate == null) {
            throw new BusinessException("該門店暫無可用的贈送天數記錄");
        }
        for (AdNewStoreOrderRequest.CellSelection cell : request.getCells()) {
            if (cell.getBizDate().isAfter(expireDate)) {
                throw new BusinessException("購買日期超出贈送有效期(" + expireDate + ")");
            }
        }

        // 4. 写订单主表（actualAmount=0, giftDays=N, giftAmount=0）
        LocalDateTime now = LocalDateTime.now();
        String orderNo = bizSeqService.next(BizSeqService.RULE_AD_ORDER_NEW_STORE);
        BizMerchantGroup group = groupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>()
                        .eq(BizMerchantGroup::getGroupCode, request.getGroupCode())
                        .last("LIMIT 1"));

        AdOrder order = new AdOrder();
        order.setOrderNo(orderNo);
        order.setAlgoType(algorithm.getAlgoType());
        order.setAlgoId(algorithm.getId());
        order.setAlgoName(algorithm.getAlgoName());
        order.setAlgoCode(algorithm.getAlgoCode());
        order.setBrand(brand);
        order.setChannel(algorithm.getChannel());
        order.setGroupCode(request.getGroupCode());
        order.setGroupName(group != null ? group.getGroupName() : request.getGroupCode());
        order.setStoreCode(store.getStoreCode());
        order.setStoreName(store.getStoreName());
        order.setBdEmpId(request.getBdEmpId());
        // 下单人快照: 当前登录的业务人员
        SysUser operator = operatorResolver.currentUser();
        if (operator != null) {
            order.setOperatorType(2);
            order.setOperatorId(StringUtils.hasText(operator.getEmpId()) ? operator.getEmpId() : operator.getUsername());
            order.setOperatorName(StringUtils.hasText(operator.getName()) ? operator.getName() : operator.getUsername());
        }
        order.setItemCount(giftDays);
        order.setOriginalAmount(BigDecimal.ZERO);
        order.setDiscountAmount(BigDecimal.ZERO);
        order.setActualAmount(BigDecimal.ZERO);
        order.setRefundAmount(BigDecimal.ZERO);
        order.setGiftDays(giftDays);
        order.setGiftAmount(BigDecimal.ZERO);
        order.setStatus(1); // 初始状态=待推广，查询时动态计算真实状态
        order.setOrderTime(now);
        order.setPayTime(now);
        order.setRemark(request.getRemark());
        order.setUpdatedBy(operatorResolver.currentOperatorName());
        order.setDeleted(0);
        orderMapper.insert(order);

        // 5. 写明细（每条 bizDate 一行）
        for (AdNewStoreOrderRequest.CellSelection cell : request.getCells()) {
            AdOrderItemNewStore item = new AdOrderItemNewStore();
            item.setOrderId(order.getId());
            item.setOrderNo(orderNo);
            item.setBizDate(cell.getBizDate());
            item.setDeliveryStatus(1);
            item.setDeleted(0);
            itemMapper.insert(item);
        }

        // 6. 扣减赠送天数余额并写消费流水（与订单同事务）
        giftService.deductForOrder(store.getId(), GIFT_AD_TYPE, giftDays, orderNo,
                algorithm.getAlgoCode(), algorithm.getAlgoName());

        // 7. 不调用 finWriteChainService（实付为 0，无推广金变动）
        return AdOrderVO.from(order);
    }

    /* ==================== 内部方法 ==================== */

    private AdAlgorithm requireActiveAlgorithm(Long algoId) {
        AdAlgorithm algorithm = algorithmMapper.selectById(algoId);
        if (algorithm == null) {
            throw new BusinessException("算法不存在");
        }
        if (algorithm.getStatus() == null || algorithm.getStatus() != 1) {
            throw new BusinessException("算法已停用，無法購買");
        }
        return algorithm;
    }

    private BizStore requireStore(String storeCode) {
        if (!StringUtils.hasText(storeCode)) {
            throw new BusinessException("請選擇門店");
        }
        BizStore store = storeMapper.selectOne(
                new LambdaQueryWrapper<BizStore>()
                        .eq(BizStore::getStoreCode, storeCode)
                        .last("LIMIT 1"));
        if (store == null) {
            throw new BusinessException("門店不存在");
        }
        return store;
    }
}
