package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamConsumableDocService;
import com.mftb.admin.service.SysCompanyBrandService;
import com.mftb.admin.service.SysPurchaseCompanyService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 耗材单据服务实现（退料 / 库存调整 / 仓库调拨 / 入库单 CRUD）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamConsumableDocServiceImpl implements EamConsumableDocService {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final EamConsumableItemMapper itemMapper;
    private final EamConsumableStockMapper stockMapper;
    private final EamConsumableTxnMapper txnMapper;
    private final EamConsumableReturnMapper returnMapper;
    private final EamConsumableAdjustMapper adjustMapper;
    private final EamConsumableTransferMapper transferMapper;
    private final EamConsumableInboundMapper inboundMapper;
    private final EamConsumableInboundItemMapper inboundItemMapper;
    private final EamConsumableClaimItemMapper claimItemMapper;
    private final EamLocationMapper locationMapper;
    private final SysCompanyBrandService companyBrandService;
    private final SysPurchaseCompanyService purchaseCompanyService;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    /* ==================== 退料 ==================== */

    @Override
    public PageResult<EamConsumableReturnVO> pageReturns(EamConsumableReturnQuery query) {
        // 如有文本过滤条件，先从 item 表查出匹配的 ID 集合
        Set<Long> matchedItemIds = resolveItemIds(query.getItemCode(), query.getItemName());
        if (matchedItemIds != null && matchedItemIds.isEmpty()) return new PageResult<>(List.of(), 0L);

        LambdaQueryWrapper<EamConsumableReturn> wrapper = new LambdaQueryWrapper<>();
        if (matchedItemIds != null) wrapper.in(EamConsumableReturn::getItemId, matchedItemIds);
        if (StringUtils.hasText(query.getReturnNo())) wrapper.like(EamConsumableReturn::getReturnNo, query.getReturnNo().trim());
        if (StringUtils.hasText(query.getApplicantName())) wrapper.like(EamConsumableReturn::getApplicantName, query.getApplicantName().trim());
        if (StringUtils.hasText(query.getStartTime()) || StringUtils.hasText(query.getEndTime())) {
            try {
                if (StringUtils.hasText(query.getStartTime()))
                    wrapper.ge(EamConsumableReturn::getCreatedAt, LocalDate.parse(query.getStartTime().trim()).atStartOfDay());
                if (StringUtils.hasText(query.getEndTime()))
                    wrapper.le(EamConsumableReturn::getCreatedAt, LocalDate.parse(query.getEndTime().trim()).atTime(23, 59, 59));
            } catch (DateTimeParseException e) {
                throw new BusinessException("時間範圍格式錯誤，應為 yyyy-MM-dd");
            }
        }
        wrapper.orderByDesc(EamConsumableReturn::getId);

        Page<EamConsumableReturn> page = returnMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                wrapper);
        List<EamConsumableReturnVO> records = page.getRecords().stream().map(this::toReturnVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createReturn(EamConsumableReturnSaveDTO dto) {
        if (dto.getItemId() == null) throw new BusinessException("請選擇耗材");
        if (dto.getQty() == null || dto.getQty() <= 0) throw new BusinessException("退料數量必須大於 0");
        EamConsumableItem item = itemMapper.selectById(dto.getItemId());
        if (item == null) throw new BusinessException("耗材不存在");
        if (item.getCompanyBrand() == null || item.getPurchaseCompanyId() == null)
            throw new BusinessException("耗材檔案未設置所屬品牌/購買公司，不可退料");

        long locationId = dto.getLocationId() == null ? 0L : dto.getLocationId();
        String locationName = resolveLocationName(locationId);

        // 退料单价：优先取 DTO 指定值，其次取原领用明细的实际出库均价
        BigDecimal unitCost = dto.getUnitCost();
        if (unitCost == null && dto.getClaimItemId() != null) {
            EamConsumableClaimItem ci = claimItemMapper.selectById(dto.getClaimItemId());
            if (ci != null) unitCost = ci.getActualUnitCost();
        }
        if (unitCost == null) unitCost = BigDecimal.ZERO;

        BigDecimal amount = EamConsumableServiceImpl.money(unitCost.multiply(BigDecimal.valueOf(dto.getQty())));
        String operator = operatorResolver.currentOperatorName();

        // 写退料单
        EamConsumableReturn ret = new EamConsumableReturn();
        ret.setReturnNo(bizSeqService.next(BizSeqService.RULE_EAM_CONSUMABLE_RETURN));
        ret.setClaimId(dto.getClaimId());
        ret.setClaimItemId(dto.getClaimItemId());
        ret.setItemId(item.getId());
        ret.setLocationId(locationId);
        ret.setLocationName(locationName == null ? "" : locationName);
        ret.setQty(dto.getQty());
        ret.setUnitCost(unitCost);
        ret.setAmount(amount);
        ret.setApplicantId(dto.getClaimId() != null ? null : null); // 关联领用单时由 claim 回填
        ret.setApplicantName("");
        ret.setDepartmentId(dto.getDepartmentId());
        ret.setDepartment("");
        ret.setReason(dto.getReason() == null ? "" : dto.getReason());
        ret.setOperator(operator);
        ret.setCreatedBy(operator);
        returnMapper.insert(ret);

        // 退回库存（入库操作）
        stockMapper.inbound(item.getId(), locationId, locationName == null ? "" : locationName,
                dto.getQty(), amount, item.getCompanyBrand(), item.getPurchaseCompanyId(),
                nullToEmpty(item.getPurchaseCompany()), operator);

        // 写流水
        EamConsumableStock after = stockMapper.selectForUpdate(item.getId(), locationId);
        int afterQty = after != null ? after.getQty() : 0;
        int beforeQty = afterQty - dto.getQty();
        writeTxn(item, locationId, locationName, "in_return", dto.getQty(), beforeQty, afterQty,
                unitCost, amount, "return", ret.getId(), "退料入庫");

        // 更新领用明细已退料数量
        if (dto.getClaimItemId() != null) {
            EamConsumableClaimItem ci = claimItemMapper.selectById(dto.getClaimItemId());
            if (ci != null) {
                ci.setReturnedQty((ci.getReturnedQty() == null ? 0 : ci.getReturnedQty()) + dto.getQty());
                claimItemMapper.updateById(ci);
            }
        }

        log.info("退料单创建完成: {}, 耗材: {}, 数量: {}", ret.getReturnNo(), item.getName(), dto.getQty());
        return ret.getId();
    }

    /* ==================== 库存调整 ==================== */

    @Override
    public PageResult<EamConsumableAdjustVO> pageAdjusts(EamConsumableAdjustQuery query) {
        Set<Long> matchedItemIds = resolveItemIds(query.getItemCode(), query.getItemName());
        if (matchedItemIds != null && matchedItemIds.isEmpty()) return new PageResult<>(List.of(), 0L);

        LambdaQueryWrapper<EamConsumableAdjust> wrapper = new LambdaQueryWrapper<>();
        if (matchedItemIds != null) wrapper.in(EamConsumableAdjust::getItemId, matchedItemIds);
        if (StringUtils.hasText(query.getAdjustNo())) wrapper.like(EamConsumableAdjust::getAdjustNo, query.getAdjustNo().trim());
        if (StringUtils.hasText(query.getDirection())) wrapper.eq(EamConsumableAdjust::getDirection, query.getDirection().trim());
        if (StringUtils.hasText(query.getStartTime()) || StringUtils.hasText(query.getEndTime())) {
            try {
                if (StringUtils.hasText(query.getStartTime()))
                    wrapper.ge(EamConsumableAdjust::getCreatedAt, LocalDate.parse(query.getStartTime().trim()).atStartOfDay());
                if (StringUtils.hasText(query.getEndTime()))
                    wrapper.le(EamConsumableAdjust::getCreatedAt, LocalDate.parse(query.getEndTime().trim()).atTime(23, 59, 59));
            } catch (DateTimeParseException e) {
                throw new BusinessException("時間範圍格式錯誤，應為 yyyy-MM-dd");
            }
        }
        wrapper.orderByDesc(EamConsumableAdjust::getId);

        Page<EamConsumableAdjust> page = adjustMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                wrapper);
        List<EamConsumableAdjustVO> records = page.getRecords().stream().map(this::toAdjustVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createAdjust(EamConsumableAdjustSaveDTO dto) {
        if (dto.getItemId() == null) throw new BusinessException("請選擇耗材");
        if (!"in".equals(dto.getDirection()) && !"out".equals(dto.getDirection()))
            throw new BusinessException("調整方向必須為 in（盤盈）或 out（盤虧）");
        if (dto.getQty() == null || dto.getQty() <= 0) throw new BusinessException("調整數量必須大於 0");

        EamConsumableItem item = itemMapper.selectById(dto.getItemId());
        if (item == null) throw new BusinessException("耗材不存在");
        if (item.getCompanyBrand() == null || item.getPurchaseCompanyId() == null)
            throw new BusinessException("耗材檔案未設置所屬品牌/購買公司，不可調整");

        long locationId = dto.getLocationId() == null ? 0L : dto.getLocationId();
        String locationName = resolveLocationName(locationId);

        // 盘盈时需要填单价（用于成本入账），盘亏时取当前均价
        BigDecimal unitCost = dto.getUnitCost();
        if (unitCost == null && "out".equals(dto.getDirection())) {
            EamConsumableStock stock = stockMapper.selectForUpdate(item.getId(), locationId);
            if (stock != null) unitCost = stock.getAvgCost();
        }
        if (unitCost == null) unitCost = BigDecimal.ZERO;
        BigDecimal amount = EamConsumableServiceImpl.money(unitCost.multiply(BigDecimal.valueOf(dto.getQty())));

        int delta = "in".equals(dto.getDirection()) ? dto.getQty() : -dto.getQty();
        int affected = stockMapper.adjust(item.getId(), locationId, delta);
        if (affected == 0) throw new BusinessException("庫存調整失敗：庫存不足或耗材無庫存記錄");

        String operator = operatorResolver.currentOperatorName();

        // 写调整单
        EamConsumableAdjust adj = new EamConsumableAdjust();
        adj.setAdjustNo(bizSeqService.next(BizSeqService.RULE_EAM_CONSUMABLE_ADJUST));
        adj.setItemId(item.getId());
        adj.setLocationId(locationId);
        adj.setLocationName(locationName == null ? "" : locationName);
        adj.setDirection(dto.getDirection());
        adj.setQty(dto.getQty());
        adj.setUnitCost(unitCost);
        adj.setAmount(amount);
        adj.setReason(dto.getReason() == null ? "" : dto.getReason());
        adj.setOperator(operator);
        adj.setCreatedBy(operator);
        adjustMapper.insert(adj);

        // 写流水
        String txnType = "in".equals(dto.getDirection()) ? "in_adjust" : "out_adjust";
        EamConsumableStock after = stockMapper.selectForUpdate(item.getId(), locationId);
        int afterQty = after != null ? after.getQty() : 0;
        int beforeQty = afterQty - delta;
        writeTxn(item, locationId, locationName, txnType, delta, beforeQty, afterQty,
                unitCost, amount, "adjust", adj.getId(), dto.getReason());

        log.info("库存调整单创建完成: {}, 方向: {}, 数量: {}", adj.getAdjustNo(), dto.getDirection(), dto.getQty());
        return adj.getId();
    }

    /* ==================== 仓库调拨 ==================== */

    @Override
    public PageResult<EamConsumableTransferVO> pageTransfers(EamConsumableTransferQuery query) {
        Set<Long> matchedItemIds = resolveItemIds(query.getItemCode(), query.getItemName());
        if (matchedItemIds != null && matchedItemIds.isEmpty()) return new PageResult<>(List.of(), 0L);

        LambdaQueryWrapper<EamConsumableTransfer> wrapper = new LambdaQueryWrapper<>();
        if (matchedItemIds != null) wrapper.in(EamConsumableTransfer::getItemId, matchedItemIds);
        if (StringUtils.hasText(query.getTransferNo())) wrapper.like(EamConsumableTransfer::getTransferNo, query.getTransferNo().trim());
        if (StringUtils.hasText(query.getStartTime()) || StringUtils.hasText(query.getEndTime())) {
            try {
                if (StringUtils.hasText(query.getStartTime()))
                    wrapper.ge(EamConsumableTransfer::getCreatedAt, LocalDate.parse(query.getStartTime().trim()).atStartOfDay());
                if (StringUtils.hasText(query.getEndTime()))
                    wrapper.le(EamConsumableTransfer::getCreatedAt, LocalDate.parse(query.getEndTime().trim()).atTime(23, 59, 59));
            } catch (DateTimeParseException e) {
                throw new BusinessException("時間範圍格式錯誤，應為 yyyy-MM-dd");
            }
        }
        wrapper.orderByDesc(EamConsumableTransfer::getId);

        Page<EamConsumableTransfer> page = transferMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                wrapper);
        List<EamConsumableTransferVO> records = page.getRecords().stream().map(this::toTransferVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createTransfer(EamConsumableTransferSaveDTO dto) {
        if (dto.getItemId() == null) throw new BusinessException("請選擇耗材");
        if (dto.getQty() == null || dto.getQty() <= 0) throw new BusinessException("調撥數量必須大於 0");
        if (dto.getFromLocationId() == null) throw new BusinessException("請選擇調出倉庫");
        if (dto.getToLocationId() == null) throw new BusinessException("請選擇調入倉庫");
        if (dto.getFromLocationId().equals(dto.getToLocationId()))
            throw new BusinessException("調出倉庫與調入倉庫不能相同");

        EamConsumableItem item = itemMapper.selectById(dto.getItemId());
        if (item == null) throw new BusinessException("耗材不存在");
        if (item.getCompanyBrand() == null || item.getPurchaseCompanyId() == null)
            throw new BusinessException("耗材檔案未設置所屬品牌/購買公司，不可調撥");

        String fromLocName = resolveLocationName(dto.getFromLocationId());
        String toLocName = resolveLocationName(dto.getToLocationId());
        if (fromLocName == null) throw new BusinessException("調出倉庫不存在");
        if (toLocName == null) throw new BusinessException("調入倉庫不存在");

        // 取调出仓当前均价
        EamConsumableStock fromStock = stockMapper.selectForUpdate(item.getId(), dto.getFromLocationId());
        if (fromStock == null || fromStock.getQty() < dto.getQty())
            throw new BusinessException("調出倉庫庫存不足（當前可用: " + (fromStock == null ? 0 : fromStock.getQty()) + "）");
        BigDecimal unitCost = fromStock.getAvgCost() == null ? BigDecimal.ZERO : fromStock.getAvgCost();
        BigDecimal amount = EamConsumableServiceImpl.money(unitCost.multiply(BigDecimal.valueOf(dto.getQty())));

        String operator = operatorResolver.currentOperatorName();

        // 扣减调出仓
        int deltaOut = -dto.getQty();
        int affectedOut = stockMapper.adjust(item.getId(), dto.getFromLocationId(), deltaOut);
        if (affectedOut == 0) throw new BusinessException("調出倉庫庫存扣減失敗");

        // 增加调入仓
        stockMapper.inbound(item.getId(), dto.getToLocationId(), toLocName,
                dto.getQty(), amount, item.getCompanyBrand(), item.getPurchaseCompanyId(),
                nullToEmpty(item.getPurchaseCompany()), operator);

        // 写调拨单
        EamConsumableTransfer transfer = new EamConsumableTransfer();
        transfer.setTransferNo(bizSeqService.next(BizSeqService.RULE_EAM_CONSUMABLE_TRANSFER));
        transfer.setItemId(item.getId());
        transfer.setFromLocationId(dto.getFromLocationId());
        transfer.setFromLocationName(fromLocName);
        transfer.setToLocationId(dto.getToLocationId());
        transfer.setToLocationName(toLocName);
        transfer.setQty(dto.getQty());
        transfer.setUnitCost(unitCost);
        transfer.setAmount(amount);
        transfer.setOperator(operator);
        transfer.setCreatedBy(operator);
        transferMapper.insert(transfer);

        // 写流水（调出）
        EamConsumableStock afterFrom = stockMapper.selectForUpdate(item.getId(), dto.getFromLocationId());
        int afterFromQty = afterFrom != null ? afterFrom.getQty() : 0;
        int beforeFromQty = afterFromQty + dto.getQty();
        writeTxn(item, dto.getFromLocationId(), fromLocName, "out_transfer", -dto.getQty(), beforeFromQty, afterFromQty,
                unitCost, amount.negate(), "transfer", transfer.getId(), "調撥調出");

        // 写流水（调入）
        EamConsumableStock afterTo = stockMapper.selectForUpdate(item.getId(), dto.getToLocationId());
        int afterToQty = afterTo != null ? afterTo.getQty() : 0;
        int beforeToQty = afterToQty - dto.getQty();
        writeTxn(item, dto.getToLocationId(), toLocName, "in_transfer", dto.getQty(), beforeToQty, afterToQty,
                unitCost, amount, "transfer", transfer.getId(), "調撥調入");

        log.info("调拨单创建完成: {}, 耗材: {}, 数量: {} 从 {} 到 {}", transfer.getTransferNo(), item.getName(), dto.getQty(), fromLocName, toLocName);
        return transfer.getId();
    }

    /* ==================== 入库单 CRUD ==================== */

    @Override
    public PageResult<EamConsumableInboundVO> pageInbounds(EamConsumableInboundQuery query) {
        LambdaQueryWrapper<EamConsumableInbound> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getInboundNo())) wrapper.like(EamConsumableInbound::getInboundNo, query.getInboundNo().trim());
        if (StringUtils.hasText(query.getInboundType())) wrapper.eq(EamConsumableInbound::getInboundType, query.getInboundType().trim());
        if (query.getCompanyBrand() != null) wrapper.eq(EamConsumableInbound::getCompanyBrand, query.getCompanyBrand());
        if (query.getPurchaseCompanyId() != null) wrapper.eq(EamConsumableInbound::getPurchaseCompanyId, query.getPurchaseCompanyId());
        if (StringUtils.hasText(query.getStartTime()) || StringUtils.hasText(query.getEndTime())) {
            try {
                if (StringUtils.hasText(query.getStartTime()))
                    wrapper.ge(EamConsumableInbound::getCreatedAt, LocalDate.parse(query.getStartTime().trim()).atStartOfDay());
                if (StringUtils.hasText(query.getEndTime()))
                    wrapper.le(EamConsumableInbound::getCreatedAt, LocalDate.parse(query.getEndTime().trim()).atTime(23, 59, 59));
            } catch (DateTimeParseException e) {
                throw new BusinessException("時間範圍格式錯誤，應為 yyyy-MM-dd");
            }
        }
        wrapper.orderByDesc(EamConsumableInbound::getId);

        Page<EamConsumableInbound> page = inboundMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                wrapper);
        List<EamConsumableInboundVO> records = page.getRecords().stream().map(this::toInboundVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamConsumableInboundVO inboundDetail(long id) {
        EamConsumableInbound inbound = inboundMapper.selectById(id);
        if (inbound == null) throw new BusinessException("入庫單不存在");
        return toInboundVO(inbound);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createInbound(EamConsumableInboundSaveDTO dto) {
        if (dto.getItems() == null || dto.getItems().isEmpty())
            throw new BusinessException("入庫明細不能為空");
        if (dto.getCompanyBrand() == null) throw new BusinessException("所屬品牌不能為空");
        if (dto.getPurchaseCompanyId() == null) throw new BusinessException("購買公司不能為空");

        String operator = operatorResolver.currentOperatorName();
        String purchaseCompanyName = purchaseCompanyService.getNameById(dto.getPurchaseCompanyId());

        // 创建入库单头
        EamConsumableInbound inbound = new EamConsumableInbound();
        inbound.setInboundNo(bizSeqService.next(BizSeqService.RULE_EAM_CONSUMABLE_INBOUND));
        inbound.setInboundType(dto.getInboundType() == null ? "in_manual" : dto.getInboundType());
        inbound.setCompanyBrand(dto.getCompanyBrand());
        inbound.setPurchaseCompanyId(dto.getPurchaseCompanyId());
        inbound.setPurchaseCompany(purchaseCompanyName);
        inbound.setSupplierId(dto.getSupplierId());
        inbound.setSupplierName(dto.getSupplierName() == null ? "" : dto.getSupplierName());
        inbound.setPoId(dto.getPoId());
        inbound.setSourceType(dto.getPoId() != null ? "po" : "manual");
        inbound.setBizDate(dto.getBizDate() == null ? LocalDate.now() : dto.getBizDate());
        inbound.setRemark(dto.getRemark() == null ? "" : dto.getRemark());
        inbound.setCreatedBy(operator);
        inbound.setUpdatedBy(operator);
        inboundMapper.insert(inbound);

        // 逐行处理入库明细
        for (EamConsumableInboundSaveDTO.Item line : dto.getItems()) {
            if (line.getItemId() == null) throw new BusinessException("請選擇耗材");
            if (line.getQty() == null || line.getQty() <= 0) throw new BusinessException("入庫數量必須大於 0");
            if (line.getUnitPrice() == null || line.getUnitPrice().signum() < 0)
                throw new BusinessException("入庫單價必須為非負數");

            EamConsumableItem item = itemMapper.selectById(line.getItemId());
            if (item == null) throw new BusinessException("耗材不存在: ID=" + line.getItemId());

            long locationId = line.getLocationId() == null ? 0L : line.getLocationId();
            String locationName = resolveLocationName(locationId);
            BigDecimal lineAmount = EamConsumableServiceImpl.money(line.getUnitPrice().multiply(BigDecimal.valueOf(line.getQty())));

            // 入库库存
            stockMapper.inbound(item.getId(), locationId, locationName == null ? "" : locationName,
                    line.getQty(), lineAmount, item.getCompanyBrand(), item.getPurchaseCompanyId(),
                    nullToEmpty(item.getPurchaseCompany()), operator);

            // 写流水
            EamConsumableStock after = stockMapper.selectForUpdate(item.getId(), locationId);
            int afterQty = after != null ? after.getQty() : 0;
            int beforeQty = afterQty - line.getQty();
            writeTxn(item, locationId, locationName, "in_purchase".equals(inbound.getInboundType()) ? "in_purchase" : "in_manual",
                    line.getQty(), beforeQty, afterQty, line.getUnitPrice(), lineAmount,
                    "inbound", inbound.getId(), inbound.getRemark());

            // 写入库明细行
            EamConsumableInboundItem inboundItem = new EamConsumableInboundItem();
            inboundItem.setInboundId(inbound.getId());
            inboundItem.setItemId(item.getId());
            inboundItem.setItemCode(item.getItemCode());
            inboundItem.setItemName(item.getName());
            inboundItem.setSpec(item.getSpec() == null ? "" : item.getSpec());
            inboundItem.setUnit(item.getUnit());
            inboundItem.setLocationId(locationId);
            inboundItem.setLocationName(locationName == null ? "" : locationName);
            inboundItem.setQty(line.getQty());
            inboundItem.setUnitPrice(line.getUnitPrice());
            inboundItem.setAmount(lineAmount);
            inboundItemMapper.insert(inboundItem);
        }

        log.info("入库单创建完成: {}, 明细行数: {}", inbound.getInboundNo(), dto.getItems().size());
        return inbound.getId();
    }

    /* ==================== 内部工具 ==================== */

    private Set<Long> resolveItemIds(String itemCode, String itemName) {
        boolean hasFilter = StringUtils.hasText(itemCode) || StringUtils.hasText(itemName);
        if (!hasFilter) return null;
        LambdaQueryWrapper<EamConsumableItem> iw = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(itemCode)) iw.like(EamConsumableItem::getItemCode, itemCode.trim());
        if (StringUtils.hasText(itemName)) iw.like(EamConsumableItem::getName, itemName.trim());
        return itemMapper.selectList(iw.select(EamConsumableItem::getId))
                .stream().map(EamConsumableItem::getId).collect(Collectors.toSet());
    }

    private EamConsumableReturnVO toReturnVO(EamConsumableReturn r) {
        EamConsumableReturnVO vo = new EamConsumableReturnVO();
        vo.setId(r.getId());
        vo.setReturnNo(r.getReturnNo());
        vo.setClaimId(r.getClaimId());
        vo.setClaimItemId(r.getClaimItemId());
        vo.setItemId(r.getItemId());
        vo.setLocationId(r.getLocationId());
        vo.setLocationName(r.getLocationName());
        vo.setQty(r.getQty());
        vo.setUnitCost(r.getUnitCost());
        vo.setAmount(r.getAmount());
        vo.setApplicantId(r.getApplicantId());
        vo.setApplicantName(r.getApplicantName());
        vo.setDepartmentId(r.getDepartmentId());
        vo.setDepartment(r.getDepartment());
        vo.setReason(r.getReason());
        vo.setOperator(r.getOperator());
        vo.setCreatedBy(r.getCreatedBy());
        vo.setCreatedAt(r.getCreatedAt() == null ? null : r.getCreatedAt().format(DT_FMT));
        // 回填耗材信息
        EamConsumableItem item = itemMapper.selectById(r.getItemId());
        if (item != null) {
            vo.setItemCode(item.getItemCode());
            vo.setItemName(item.getName());
            vo.setSpec(item.getSpec());
            vo.setUnit(item.getUnit());
        }
        return vo;
    }

    private EamConsumableAdjustVO toAdjustVO(EamConsumableAdjust a) {
        EamConsumableAdjustVO vo = new EamConsumableAdjustVO();
        vo.setId(a.getId());
        vo.setAdjustNo(a.getAdjustNo());
        vo.setItemId(a.getItemId());
        vo.setLocationId(a.getLocationId());
        vo.setLocationName(a.getLocationName());
        vo.setDirection(a.getDirection());
        vo.setQty(a.getQty());
        vo.setUnitCost(a.getUnitCost());
        vo.setAmount(a.getAmount());
        vo.setReason(a.getReason());
        vo.setOperator(a.getOperator());
        vo.setCreatedBy(a.getCreatedBy());
        vo.setCreatedAt(a.getCreatedAt() == null ? null : a.getCreatedAt().format(DT_FMT));
        EamConsumableItem item = itemMapper.selectById(a.getItemId());
        if (item != null) {
            vo.setItemCode(item.getItemCode());
            vo.setItemName(item.getName());
            vo.setSpec(item.getSpec());
            vo.setUnit(item.getUnit());
        }
        return vo;
    }

    private EamConsumableTransferVO toTransferVO(EamConsumableTransfer t) {
        EamConsumableTransferVO vo = new EamConsumableTransferVO();
        vo.setId(t.getId());
        vo.setTransferNo(t.getTransferNo());
        vo.setItemId(t.getItemId());
        vo.setFromLocationId(t.getFromLocationId());
        vo.setFromLocationName(t.getFromLocationName());
        vo.setToLocationId(t.getToLocationId());
        vo.setToLocationName(t.getToLocationName());
        vo.setQty(t.getQty());
        vo.setUnitCost(t.getUnitCost());
        vo.setAmount(t.getAmount());
        vo.setOperator(t.getOperator());
        vo.setCreatedBy(t.getCreatedBy());
        vo.setCreatedAt(t.getCreatedAt() == null ? null : t.getCreatedAt().format(DT_FMT));
        EamConsumableItem item = itemMapper.selectById(t.getItemId());
        if (item != null) {
            vo.setItemCode(item.getItemCode());
            vo.setItemName(item.getName());
            vo.setSpec(item.getSpec());
            vo.setUnit(item.getUnit());
        }
        return vo;
    }

    private EamConsumableInboundVO toInboundVO(EamConsumableInbound inbound) {
        EamConsumableInboundVO vo = new EamConsumableInboundVO();
        vo.setId(inbound.getId());
        vo.setInboundNo(inbound.getInboundNo());
        vo.setInboundType(inbound.getInboundType());
        vo.setCompanyBrand(inbound.getCompanyBrand());
        vo.setCompanyBrandName(inbound.getCompanyBrand() != null ? companyBrandService.getLabelById(inbound.getCompanyBrand()) : "");
        vo.setPurchaseCompanyId(inbound.getPurchaseCompanyId());
        vo.setPurchaseCompany(inbound.getPurchaseCompany());
        vo.setSupplierId(inbound.getSupplierId());
        vo.setSupplierName(inbound.getSupplierName());
        vo.setPoId(inbound.getPoId());
        vo.setPoNo(inbound.getPoNo());
        vo.setBizDate(inbound.getBizDate());
        vo.setRemark(inbound.getRemark());
        vo.setCreatedBy(inbound.getCreatedBy());
        vo.setCreatedAt(inbound.getCreatedAt() == null ? null : inbound.getCreatedAt().format(DT_FMT));
        // 明细
        List<EamConsumableInboundItem> items = inboundItemMapper.selectList(
                new LambdaQueryWrapper<EamConsumableInboundItem>().eq(EamConsumableInboundItem::getInboundId, inbound.getId()));
        vo.setItems(items.stream().map(this::toInboundItemVO).toList());
        vo.setTotalQty(items.stream().mapToInt(i -> i.getQty() == null ? 0 : i.getQty()).sum());
        vo.setTotalAmount(items.stream().map(i -> i.getAmount() == null ? BigDecimal.ZERO : i.getAmount()).reduce(BigDecimal.ZERO, BigDecimal::add));
        return vo;
    }

    private EamConsumableInboundItemVO toInboundItemVO(EamConsumableInboundItem item) {
        EamConsumableInboundItemVO vo = new EamConsumableInboundItemVO();
        vo.setId(item.getId());
        vo.setInboundId(item.getInboundId());
        vo.setItemId(item.getItemId());
        vo.setItemCode(item.getItemCode());
        vo.setItemName(item.getItemName());
        vo.setSpec(item.getSpec());
        vo.setUnit(item.getUnit());
        vo.setLocationId(item.getLocationId());
        vo.setLocationName(item.getLocationName());
        vo.setQty(item.getQty());
        vo.setUnitPrice(item.getUnitPrice());
        vo.setAmount(item.getAmount());
        return vo;
    }

    private String resolveLocationName(long locationId) {
        if (locationId == 0) return "默認倉";
        EamLocation loc = locationMapper.selectById(locationId);
        return loc == null ? null : loc.getName();
    }

    void writeTxn(EamConsumableItem item, long locationId, String locationName, String txnType,
                  int qty, int beforeQty, int afterQty, BigDecimal unitCost, BigDecimal amount,
                  String refType, Long refId, String remark) {
        EamConsumableTxn txn = new EamConsumableTxn();
        txn.setTxnNo("CK" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + java.util.concurrent.ThreadLocalRandom.current().nextInt(1000, 9999));
        txn.setItemId(item.getId());
        txn.setItemCode(item.getItemCode());
        txn.setItemName(item.getName());
        txn.setLocationId(locationId);
        txn.setLocationName(locationName == null ? "" : locationName);
        txn.setTxnType(txnType);
        txn.setQty(qty);
        txn.setBeforeQty(beforeQty);
        txn.setAfterQty(afterQty);
        txn.setUnitCost(unitCost);
        txn.setAmount(amount);
        txn.setCompanyBrand(item.getCompanyBrand());
        txn.setPurchaseCompanyId(item.getPurchaseCompanyId());
        txn.setBizDate(LocalDate.now());
        txn.setRefType(refType);
        txn.setRefId(refId);
        com.mftb.admin.entity.SysUser op = operatorResolver.currentUser();
        txn.setOperatorId(op != null ? op.getId() : null);
        txn.setOperator(operatorResolver.currentOperatorName());
        txn.setRemark(remark == null ? "" : remark);
        txnMapper.insert(txn);
    }

    private static String nullToEmpty(String s) { return s == null ? "" : s; }
}
