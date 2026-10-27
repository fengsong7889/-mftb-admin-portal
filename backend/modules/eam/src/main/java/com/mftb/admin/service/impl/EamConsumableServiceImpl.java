package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamConsumableService;
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
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

/**
 * 耗材管理服务实现（主数据 / 库存 / 流水 / 入库 / 预警 / 看板）
 * <p>
 * 数量型库存模型：库存变更全部走 {@link EamConsumableStockMapper} 的条件 SQL，
 * 每次变更写一条 append-only 流水（before/after 快照），保证可审计、可对账。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamConsumableServiceImpl implements EamConsumableService {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter TXN_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final EamConsumableItemMapper itemMapper;
    private final EamConsumableStockMapper stockMapper;
    private final EamConsumableTxnMapper txnMapper;
    private final EamConsumableClaimMapper claimMapper;
    private final EamCategoryMapper categoryMapper;
    private final EamLocationMapper locationMapper;
    private final EamBrandMapper brandMapper;
    private final SysCompanyBrandService companyBrandService;
    private final SysPurchaseCompanyService purchaseCompanyService;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;

    /* ==================== 主数据 ==================== */

    @Override
    public PageResult<EamConsumableItemVO> pageItems(EamConsumableItemQuery query) {
        LambdaQueryWrapper<EamConsumableItem> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(EamConsumableItem::getItemCode, kw)
                    .or().like(EamConsumableItem::getName, kw)
                    .or().like(EamConsumableItem::getSpec, kw)
                    .or().like(EamConsumableItem::getBrand, kw));
        }
        if (query.getCategoryId() != null) wrapper.eq(EamConsumableItem::getCategoryId, query.getCategoryId());
        if (StringUtils.hasText(query.getStatus())) wrapper.eq(EamConsumableItem::getStatus, query.getStatus());
        if (StringUtils.hasText(query.getItemCode())) wrapper.like(EamConsumableItem::getItemCode, query.getItemCode().trim());
        if (StringUtils.hasText(query.getName())) wrapper.like(EamConsumableItem::getName, query.getName().trim());
        if (StringUtils.hasText(query.getBrand())) wrapper.like(EamConsumableItem::getBrand, query.getBrand().trim());
        if (query.getBrandId() != null) wrapper.eq(EamConsumableItem::getBrandId, query.getBrandId());
        if (query.getCompanyBrand() != null) wrapper.eq(EamConsumableItem::getCompanyBrand, query.getCompanyBrand());
        if (query.getPurchaseCompanyId() != null) wrapper.eq(EamConsumableItem::getPurchaseCompanyId, query.getPurchaseCompanyId());
        // 单位不再是字典下拉（已废弃 biz_consumable_unit），改为自由文本，因此用模糊匹配
        if (StringUtils.hasText(query.getUnit())) wrapper.like(EamConsumableItem::getUnit, query.getUnit().trim());
        if (StringUtils.hasText(query.getUpdatedBy())) wrapper.like(EamConsumableItem::getUpdatedBy, query.getUpdatedBy().trim());
        if (StringUtils.hasText(query.getUpdateTimeStart()) || StringUtils.hasText(query.getUpdateTimeEnd())) {
            try {
                if (StringUtils.hasText(query.getUpdateTimeStart()))
                    wrapper.ge(EamConsumableItem::getUpdatedAt, LocalDate.parse(query.getUpdateTimeStart().trim()).atStartOfDay());
                if (StringUtils.hasText(query.getUpdateTimeEnd()))
                    wrapper.le(EamConsumableItem::getUpdatedAt, LocalDate.parse(query.getUpdateTimeEnd().trim()).atTime(23, 59, 59));
            } catch (DateTimeParseException e) {
                throw new BusinessException("更新時間範圍格式錯誤，應為 yyyy-MM-dd");
            }
        }
        wrapper.orderByDesc(EamConsumableItem::getId);

        // 仅看预警：需先算可用库存再过滤，走内存分页（耗材品类量级小）
        if (Boolean.TRUE.equals(query.getAlertOnly())) {
            List<EamConsumableItemVO> all = itemMapper.selectList(wrapper).stream()
                    .map(this::toItemVO).filter(vo -> Boolean.TRUE.equals(vo.getAlert())).toList();
            return paginate(all, query.getPage(), query.getSize());
        }

        Page<EamConsumableItem> page = itemMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                wrapper);
        List<EamConsumableItemVO> records = page.getRecords().stream().map(this::toItemVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamConsumableItemVO itemDetail(long id) {
        EamConsumableItem item = itemMapper.selectById(id);
        if (item == null) throw new BusinessException("耗材不存在");
        return toItemVO(item);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createItem(EamConsumableItemSaveDTO dto) {
        validateItemDto(dto);
        EamConsumableItem item = new EamConsumableItem();
        item.setItemCode(bizSeqService.next(BizSeqService.RULE_EAM_CONSUMABLE_ITEM));
        applyDto(item, dto);
        item.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "enabled");
        String op = operatorResolver.currentOperatorName();
        item.setCreatedBy(op);
        item.setUpdatedBy(op);
        itemMapper.insert(item);
        return item.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateItem(long id, EamConsumableItemSaveDTO dto) {
        EamConsumableItem item = itemMapper.selectById(id);
        if (item == null) throw new BusinessException("耗材不存在");
        validateItemDto(dto);
        applyDto(item, dto);
        if (StringUtils.hasText(dto.getStatus())) item.setStatus(dto.getStatus());
        item.setUpdatedBy(operatorResolver.currentOperatorName());
        itemMapper.updateById(item);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteItem(long id) {
        EamConsumableItem item = itemMapper.selectById(id);
        if (item == null) throw new BusinessException("耗材不存在");
        int total = stockMapper.sumQtyByItem(id);
        if (total > 0) throw new BusinessException("該耗材仍有庫存（" + total + "），不可刪除；請先清零庫存或停用");
        itemMapper.deleteById(id);
    }

    @Override
    public void toggleItemStatus(long id, String status) {
        EamConsumableItem item = itemMapper.selectById(id);
        if (item == null) throw new BusinessException("耗材不存在");
        if (!"enabled".equals(status) && !"disabled".equals(status)) throw new BusinessException("非法狀態");
        item.setStatus(status);
        item.setUpdatedBy(operatorResolver.currentOperatorName());
        itemMapper.updateById(item);
    }

    @Override
    public List<EamConsumableItemVO> itemOptions() {
        return itemMapper.selectList(new LambdaQueryWrapper<EamConsumableItem>()
                        .eq(EamConsumableItem::getStatus, "enabled")
                        .orderByDesc(EamConsumableItem::getId))
                .stream().map(this::toItemVO).toList();
    }

    /* ==================== 库存 ==================== */

    @Override
    public List<EamConsumableStockVO> stockList(EamConsumableStockQuery query) {
        // 如果有耗材文本过滤条件，先从 item 表查出匹配的 ID 集合
        boolean hasItemFilter = StringUtils.hasText(query.getItemCode())
                || StringUtils.hasText(query.getItemName())
                || StringUtils.hasText(query.getUpdatedBy())
                || StringUtils.hasText(query.getUpdateTimeStart())
                || StringUtils.hasText(query.getUpdateTimeEnd());
        Set<Long> matchedItemIds = null;
        if (hasItemFilter) {
            LambdaQueryWrapper<EamConsumableItem> iw = new LambdaQueryWrapper<>();
            if (StringUtils.hasText(query.getItemCode())) iw.like(EamConsumableItem::getItemCode, query.getItemCode().trim());
            if (StringUtils.hasText(query.getItemName())) iw.like(EamConsumableItem::getName, query.getItemName().trim());
            if (StringUtils.hasText(query.getUpdatedBy())) iw.like(EamConsumableItem::getUpdatedBy, query.getUpdatedBy().trim());
            if (StringUtils.hasText(query.getUpdateTimeStart()) || StringUtils.hasText(query.getUpdateTimeEnd())) {
                try {
                    if (StringUtils.hasText(query.getUpdateTimeStart()))
                        iw.ge(EamConsumableItem::getUpdatedAt, LocalDate.parse(query.getUpdateTimeStart().trim()).atStartOfDay());
                    if (StringUtils.hasText(query.getUpdateTimeEnd()))
                        iw.le(EamConsumableItem::getUpdatedAt, LocalDate.parse(query.getUpdateTimeEnd().trim()).atTime(23, 59, 59));
                } catch (DateTimeParseException e) {
                    throw new BusinessException("更新時間範圍格式錯誤，應為 yyyy-MM-dd");
                }
            }
            matchedItemIds = itemMapper.selectList(iw.select(EamConsumableItem::getId))
                    .stream().map(EamConsumableItem::getId).collect(Collectors.toSet());
            if (matchedItemIds.isEmpty()) return List.of();
        }

        LambdaQueryWrapper<EamConsumableStock> wrapper = new LambdaQueryWrapper<>();
        if (matchedItemIds != null) wrapper.in(EamConsumableStock::getItemId, matchedItemIds);
        if (query.getLocationId() != null) wrapper.eq(EamConsumableStock::getLocationId, query.getLocationId());
        wrapper.orderByDesc(EamConsumableStock::getQty);
        List<EamConsumableStock> rows = stockMapper.selectList(wrapper);
        if (rows.isEmpty()) return List.of();
        Map<Long, EamConsumableItem> itemMap = loadItemMap(
                rows.stream().map(EamConsumableStock::getItemId).distinct().toList());
        return rows.stream().map(s -> toStockVO(s, itemMap.get(s.getItemId()))).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void inbound(EamConsumableInboundDTO dto) {
        if (dto.getItemId() == null) throw new BusinessException("請選擇耗材");
        if (dto.getQty() == null || dto.getQty() <= 0) throw new BusinessException("入庫數量必須大於 0");
        if (dto.getUnitCost() == null || dto.getUnitCost().signum() < 0)
            throw new BusinessException("請填寫實際入庫單價（成本核算必填，不可為負）");
        EamConsumableItem item = itemMapper.selectById(dto.getItemId());
        if (item == null) throw new BusinessException("耗材不存在");
        if (item.getCompanyBrand() == null || item.getPurchaseCompanyId() == null)
            throw new BusinessException("耗材檔案未設置所屬品牌/購買公司，不可入庫：" + item.getName());
        long locationId = dto.getLocationId() == null ? 0L : dto.getLocationId();
        String locationName = resolveLocationName(locationId);
        if (locationId != 0 && locationName == null) throw new BusinessException("倉庫不存在");

        String txnType = "in_purchase".equals(dto.getTxnType()) ? "in_purchase" : "in_manual";
        EamConsumableStock before = stockMapper.selectForUpdate(item.getId(), locationId);
        int beforeQty = before == null ? 0 : nz(before.getQty());
        BigDecimal amount = money(dto.getUnitCost().multiply(BigDecimal.valueOf(dto.getQty())));

        stockMapper.inbound(item.getId(), locationId, locationName == null ? "" : locationName,
                dto.getQty(), amount, item.getCompanyBrand(), item.getPurchaseCompanyId(),
                nullToEmpty(item.getPurchaseCompany()), operatorResolver.currentOperatorName());
        int afterQty = beforeQty + dto.getQty();

        writeTxn(item, locationId, locationName, txnType, dto.getQty(), beforeQty, afterQty,
                dto.getUnitCost(), amount, null, null, dto.getRemark());
    }

    /* ==================== 流水 ==================== */

    @Override
    public List<EamConsumableTxnVO> txns(Long itemId, Long locationId, Integer limit) {
        LambdaQueryWrapper<EamConsumableTxn> wrapper = new LambdaQueryWrapper<>();
        if (itemId != null) wrapper.eq(EamConsumableTxn::getItemId, itemId);
        if (locationId != null) wrapper.eq(EamConsumableTxn::getLocationId, locationId);
        wrapper.orderByDesc(EamConsumableTxn::getId);
        int lim = (limit == null || limit <= 0) ? 50 : Math.min(limit, 200);
        wrapper.last("LIMIT " + lim);
        return txnMapper.selectList(wrapper).stream().map(this::toTxnVO).toList();
    }

    @Override
    public PageResult<EamConsumableTxnVO> pageTxns(EamConsumableTxnQuery query) {
        LambdaQueryWrapper<EamConsumableTxn> wrapper = buildTxnWrapper(query);
        wrapper.orderByDesc(EamConsumableTxn::getId);
        Page<EamConsumableTxn> page = txnMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                wrapper);
        List<EamConsumableTxnVO> records = page.getRecords().stream().map(this::toTxnVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamConsumableTxnStatsVO txnStats(EamConsumableTxnQuery query) {
        LambdaQueryWrapper<EamConsumableTxn> wrapper = buildTxnWrapper(query);
        wrapper.select(EamConsumableTxn::getTxnType, EamConsumableTxn::getQty);
        List<EamConsumableTxn> rows = txnMapper.selectList(wrapper);
        long inCount = rows.stream()
                .filter(t -> t.getTxnType() != null && t.getTxnType().startsWith("in"))
                .count();
        int netQty = rows.stream().mapToInt(t -> t.getQty() == null ? 0 : t.getQty()).sum();
        EamConsumableTxnStatsVO vo = new EamConsumableTxnStatsVO();
        vo.setTotal((long) rows.size());
        vo.setInCount(inCount);
        vo.setOutCount(rows.size() - inCount);
        vo.setNetQty(netQty);
        return vo;
    }

    /** 流水分页 / 统计共用过滤条件（不含排序与列选择） */
    private LambdaQueryWrapper<EamConsumableTxn> buildTxnWrapper(EamConsumableTxnQuery query) {
        LambdaQueryWrapper<EamConsumableTxn> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getItemCode()))
            wrapper.like(EamConsumableTxn::getItemCode, query.getItemCode().trim());
        if (StringUtils.hasText(query.getItemName()))
            wrapper.like(EamConsumableTxn::getItemName, query.getItemName().trim());
        if (StringUtils.hasText(query.getTxnType()))
            wrapper.eq(EamConsumableTxn::getTxnType, query.getTxnType().trim());
        if (StringUtils.hasText(query.getOperator()))
            wrapper.like(EamConsumableTxn::getOperator, query.getOperator().trim());
        if (StringUtils.hasText(query.getTxnTimeStart()) || StringUtils.hasText(query.getTxnTimeEnd())) {
            try {
                if (StringUtils.hasText(query.getTxnTimeStart()))
                    wrapper.ge(EamConsumableTxn::getCreatedAt, LocalDate.parse(query.getTxnTimeStart().trim()).atStartOfDay());
                if (StringUtils.hasText(query.getTxnTimeEnd()))
                    wrapper.le(EamConsumableTxn::getCreatedAt, LocalDate.parse(query.getTxnTimeEnd().trim()).atTime(23, 59, 59));
            } catch (DateTimeParseException e) {
                throw new BusinessException("操作時間範圍格式錯誤，應為 yyyy-MM-dd");
            }
        }
        return wrapper;
    }

    /* ==================== 预警 ==================== */

    @Override
    public List<EamConsumableItemVO> alerts(String itemCode, String name, Long categoryId) {
        LambdaQueryWrapper<EamConsumableItem> wrapper = new LambdaQueryWrapper<EamConsumableItem>()
                .eq(EamConsumableItem::getStatus, "enabled");
        if (StringUtils.hasText(itemCode))
            wrapper.like(EamConsumableItem::getItemCode, itemCode.trim());
        if (StringUtils.hasText(name))
            wrapper.like(EamConsumableItem::getName, name.trim());
        if (categoryId != null)
            wrapper.eq(EamConsumableItem::getCategoryId, categoryId);
        return itemMapper.selectList(wrapper)
                .stream().map(this::toItemVO)
                .filter(vo -> Boolean.TRUE.equals(vo.getAlert()))
                .sorted(Comparator.comparingInt(
                        (EamConsumableItemVO vo) -> vo.getSafetyStock() - vo.getAvailableQty()).reversed())
                .toList();
    }

    /* ==================== 看板 ==================== */

    @Override
    public EamConsumableDashboardVO dashboard() {
        EamConsumableDashboardVO vo = new EamConsumableDashboardVO();
        List<EamConsumableItem> items = itemMapper.selectList(new LambdaQueryWrapper<>());
        List<EamConsumableItem> enabled = items.stream()
                .filter(i -> "enabled".equals(i.getStatus())).toList();
        LocalDateTime monthStart = LocalDateTime.now().withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0).withNano(0);

        List<EamConsumableStock> stocks = stockMapper.selectList(new LambdaQueryWrapper<>());
        int totalQty = stocks.stream().mapToInt(s -> s.getQty() == null ? 0 : s.getQty()).sum();
        // 库存金额取移动加权平均实际成本（total_cost），不再用档案参考单价估算
        BigDecimal totalValue = stocks.stream()
                .map(s -> s.getTotalCost() == null ? BigDecimal.ZERO : s.getTotalCost())
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        vo.setItemKinds(enabled.size());
        vo.setTotalStockQty(totalQty);
        vo.setTotalStockValue(money(totalValue));

        // 本月消耗金额（out_claim 流水金额绝对值合计，按业务记账日期）
        vo.setMonthConsumeAmount(money(txnMapper.selectList(new LambdaQueryWrapper<EamConsumableTxn>()
                        .eq(EamConsumableTxn::getTxnType, "out_claim")
                        .ge(EamConsumableTxn::getBizDate, monthStart.toLocalDate()))
                .stream().map(t -> t.getAmount() == null ? BigDecimal.ZERO : t.getAmount())
                .reduce(BigDecimal.ZERO, BigDecimal::add).abs()));

        List<EamConsumableItemVO> alertItems = enabled.stream().map(this::toItemVO)
                .filter(v -> Boolean.TRUE.equals(v.getAlert()))
                .sorted(Comparator.comparingInt(
                        (EamConsumableItemVO v) -> v.getSafetyStock() - v.getAvailableQty()).reversed())
                .toList();
        vo.setAlertCount(alertItems.size());
        vo.setAlertItems(alertItems.stream().limit(8).toList());

        vo.setPendingApproveCount(Math.toIntExact(claimMapper.selectCount(
                new LambdaQueryWrapper<EamConsumableClaim>().eq(EamConsumableClaim::getStatus, "pending"))));
        vo.setMonthClaimCount(Math.toIntExact(claimMapper.selectCount(
                new LambdaQueryWrapper<EamConsumableClaim>().ge(EamConsumableClaim::getCreatedAt, monthStart))));

        vo.setRecentTxns(txns(null, null, 10));
        return vo;
    }

    /* ==================== 内部工具 ==================== */

    private void validateItemDto(EamConsumableItemSaveDTO dto) {
        if (!StringUtils.hasText(dto.getName())) throw new BusinessException("耗材名稱不能為空");
        if (!StringUtils.hasText(dto.getUnit())) throw new BusinessException("計量單位不能為空");
        if (dto.getCompanyBrand() == null) throw new BusinessException("所屬品牌不能為空");
        if (dto.getPurchaseCompanyId() == null) throw new BusinessException("購買公司不能為空");
        if (dto.getSafetyStock() != null && dto.getSafetyStock() < 0) throw new BusinessException("安全庫存不可為負");
        if (dto.getMaxStock() != null && dto.getMaxStock() < 0) throw new BusinessException("庫存上限不可為負");
        if (dto.getPerClaimLimit() != null && dto.getPerClaimLimit() < 0) throw new BusinessException("限領量不可為負");
    }

    private void applyDto(EamConsumableItem item, EamConsumableItemSaveDTO dto) {
        item.setName(dto.getName().trim());
        item.setBrand(nullToEmpty(dto.getBrand()));
        item.setSpec(nullToEmpty(dto.getSpec()));
        item.setUnit(dto.getUnit().trim());
        item.setRefPrice(dto.getRefPrice() == null ? BigDecimal.ZERO : dto.getRefPrice());
        item.setImage(dto.getImage());
        item.setSafetyStock(dto.getSafetyStock() == null ? 0 : dto.getSafetyStock());
        item.setMaxStock(dto.getMaxStock() == null ? 0 : dto.getMaxStock());
        item.setPerClaimLimit(dto.getPerClaimLimit() == null ? 0 : dto.getPerClaimLimit());
        item.setRemark(nullToEmpty(dto.getRemark()));
        // 耗材分类快照（统一分类库 biz_eam_category，biz_type=CONSUMABLE）
        if (dto.getConsumableCategoryId() != null) {
            EamCategory cc = categoryMapper.selectById(dto.getConsumableCategoryId());
            item.setConsumableCategoryId(dto.getConsumableCategoryId());
            if (cc != null) {
                // 同时更新旧的 categoryId/categoryCode/categoryName 以保持兼容
                item.setCategoryId(dto.getConsumableCategoryId());
                item.setCategoryCode(cc.getCode());
                item.setCategoryName(cc.getName());
            }
        } else {
            item.setConsumableCategoryId(null);
            item.setCategoryId(null);
            item.setCategoryCode("");
            item.setCategoryName("");
        }
        // 耗材厂商品牌快照（统一品牌库 biz_eam_brand，biz_type=CONSUMABLE）
        if (dto.getBrandId() != null) {
            EamBrand cb = brandMapper.selectById(dto.getBrandId());
            item.setBrandId(dto.getBrandId());
            item.setBrand(cb != null ? cb.getBrandZh() : nullToEmpty(dto.getBrand()));
        } else {
            item.setBrandId(null);
            item.setBrand(nullToEmpty(dto.getBrand()));
        }
        // 所属品牌（閃蜂/mFood）+ 购买公司（名称快照由字典解析）
        item.setCompanyBrand(dto.getCompanyBrand());
        item.setPurchaseCompanyId(dto.getPurchaseCompanyId());
        item.setPurchaseCompany(purchaseCompanyService.getNameById(dto.getPurchaseCompanyId()));
    }

    private EamConsumableItemVO toItemVO(EamConsumableItem item) {
        EamConsumableItemVO vo = new EamConsumableItemVO();
        vo.setId(item.getId());
        vo.setItemCode(item.getItemCode());
        vo.setName(item.getName());
        vo.setCategoryId(item.getCategoryId());
        vo.setCategoryCode(item.getCategoryCode());
        vo.setCategoryName(item.getCategoryName());
        vo.setConsumableCategoryId(item.getConsumableCategoryId());
        // 耗材分类名称（统一分类库）
        if (item.getConsumableCategoryId() != null) {
            EamCategory cc = categoryMapper.selectById(item.getConsumableCategoryId());
            vo.setConsumableCategoryName(cc != null ? cc.getName() : item.getCategoryName());
        }
        vo.setBrandId(item.getBrandId());
        if (item.getBrandId() != null) {
            EamBrand cb = brandMapper.selectById(item.getBrandId());
            vo.setBrandName(cb != null ? cb.getBrandZh() : item.getBrand());
        }
        vo.setBrand(item.getBrand());
        // 所属品牌 + 购买公司
        vo.setCompanyBrand(item.getCompanyBrand());
        vo.setCompanyBrandName(item.getCompanyBrand() != null ? companyBrandService.getLabelById(item.getCompanyBrand()) : "");
        vo.setPurchaseCompanyId(item.getPurchaseCompanyId());
        vo.setPurchaseCompanyName(StringUtils.hasText(item.getPurchaseCompany())
                ? item.getPurchaseCompany()
                : purchaseCompanyService.getNameById(item.getPurchaseCompanyId()));
        vo.setSpec(item.getSpec());
        vo.setUnit(item.getUnit());
        vo.setRefPrice(item.getRefPrice());
        vo.setImage(item.getImage());
        vo.setSafetyStock(nz(item.getSafetyStock()));
        vo.setMaxStock(nz(item.getMaxStock()));
        vo.setPerClaimLimit(nz(item.getPerClaimLimit()));
        vo.setStatus(item.getStatus());
        vo.setRemark(item.getRemark());
        vo.setCreatedBy(item.getCreatedBy());
        vo.setUpdatedBy(item.getUpdatedBy());
        vo.setUpdatedAt(dt(item.getUpdatedAt()));
        int totalQty = stockMapper.sumQtyByItem(item.getId());
        int availableQty = stockMapper.sumAvailableByItem(item.getId());
        vo.setTotalQty(totalQty);
        vo.setAvailableQty(availableQty);
        vo.setLockedQty(totalQty - availableQty);
        vo.setAlert(vo.getSafetyStock() > 0 && availableQty < vo.getSafetyStock());
        return vo;
    }

    private EamConsumableStockVO toStockVO(EamConsumableStock s, EamConsumableItem item) {
        EamConsumableStockVO vo = new EamConsumableStockVO();
        vo.setId(s.getId());
        vo.setItemId(s.getItemId());
        vo.setLocationId(s.getLocationId());
        vo.setLocationName(s.getLocationName());
        vo.setQty(nz(s.getQty()));
        vo.setLockedQty(nz(s.getLockedQty()));
        vo.setAvailableQty(nz(s.getQty()) - nz(s.getLockedQty()));
        vo.setCompanyBrand(s.getCompanyBrand());
        vo.setPurchaseCompanyName(s.getPurchaseCompany());
        vo.setAvgCost(s.getAvgCost());
        vo.setTotalCost(s.getTotalCost());
        // 库存审计取真实库存行变更人/时间（而非档案）
        vo.setUpdatedBy(StringUtils.hasText(s.getUpdatedBy()) ? s.getUpdatedBy() : (item != null ? item.getUpdatedBy() : null));
        vo.setUpdatedAt(dt(s.getUpdatedAt() != null ? s.getUpdatedAt() : (item != null ? item.getUpdatedAt() : null)));
        if (item != null) {
            vo.setItemCode(item.getItemCode());
            vo.setItemName(item.getName());
            vo.setSpec(item.getSpec());
            vo.setUnit(item.getUnit());
            vo.setCategoryName(item.getCategoryName());
            vo.setSafetyStock(nz(item.getSafetyStock()));
            vo.setAlert(nz(item.getSafetyStock()) > 0 && vo.getAvailableQty() < nz(item.getSafetyStock()));
        } else {
            vo.setSafetyStock(0);
            vo.setAlert(false);
        }
        return vo;
    }

    private EamConsumableTxnVO toTxnVO(EamConsumableTxn t) {
        EamConsumableTxnVO vo = new EamConsumableTxnVO();
        vo.setId(t.getId());
        vo.setTxnNo(t.getTxnNo());
        vo.setItemId(t.getItemId());
        vo.setItemCode(t.getItemCode());
        vo.setItemName(t.getItemName());
        vo.setLocationId(t.getLocationId());
        vo.setLocationName(t.getLocationName());
        vo.setTxnType(t.getTxnType());
        vo.setQty(t.getQty());
        vo.setBeforeQty(t.getBeforeQty());
        vo.setAfterQty(t.getAfterQty());
        vo.setUnitCost(t.getUnitCost());
        vo.setAmount(t.getAmount());
        vo.setCompanyBrand(t.getCompanyBrand());
        vo.setPurchaseCompanyId(t.getPurchaseCompanyId());
        vo.setDepartment(t.getDepartment());
        vo.setApplicantEmpId(t.getApplicantEmpId());
        vo.setApplicantName(t.getApplicantName());
        vo.setBizDate(t.getBizDate() == null ? null : t.getBizDate().format(DATE_FMT));
        vo.setRefType(t.getRefType());
        vo.setRefId(t.getRefId());
        vo.setOperator(t.getOperator());
        vo.setRemark(t.getRemark());
        vo.setCreatedAt(dt(t.getCreatedAt()));
        return vo;
    }

    /** 写一条出入库流水（append-only），携带成本金额与归属/领用人快照 */
    void writeTxn(EamConsumableItem item, long locationId, String locationName, String txnType,
                  int qty, int beforeQty, int afterQty, BigDecimal unitCost, BigDecimal amount,
                  String refType, Long refId, String remark) {
        EamConsumableTxn txn = new EamConsumableTxn();
        txn.setTxnNo("CK" + LocalDateTime.now().format(TXN_FMT) + ThreadLocalRandom.current().nextInt(1000, 9999));
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
        SysUser op = operatorResolver.currentUser();
        txn.setOperatorId(op != null ? op.getId() : null);
        txn.setOperator(operatorResolver.currentOperatorName());
        txn.setRemark(remark == null ? "" : remark);
        txnMapper.insert(txn);
    }

    private Map<Long, EamConsumableItem> loadItemMap(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        return itemMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(EamConsumableItem::getId, i -> i, (a, b) -> a));
    }

    private String resolveLocationName(long locationId) {
        if (locationId == 0) return "默認倉";
        EamLocation loc = locationMapper.selectById(locationId);
        return loc == null ? null : loc.getName();
    }

    private PageResult<EamConsumableItemVO> paginate(List<EamConsumableItemVO> all, Integer page, Integer size) {
        long p = PageResult.normalizePage(page == null ? 1 : page);
        long s = PageResult.normalizeSize(size == null ? 10 : size);
        int from = (int) ((p - 1) * s);
        if (from >= all.size()) return new PageResult<>(List.of(), (long) all.size());
        int to = (int) Math.min(from + s, all.size());
        return new PageResult<>(all.subList(from, to), (long) all.size());
    }

    private static int nz(Integer v) { return v == null ? 0 : v; }
    private static String nullToEmpty(String s) { return s == null ? "" : s; }
    private static String dt(LocalDateTime t) { return t == null ? null : t.format(DT_FMT); }
    /** 金额取两位小数（HALF_UP） */
    static BigDecimal money(BigDecimal v) {
        return v == null ? BigDecimal.ZERO.setScale(2, java.math.RoundingMode.HALF_UP)
                : v.setScale(2, java.math.RoundingMode.HALF_UP);
    }
}
