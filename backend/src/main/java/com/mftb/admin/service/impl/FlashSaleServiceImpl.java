package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.dto.FlashSaleDTOs;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.BizFlashSalePeriod;
import com.mftb.admin.entity.BizFlashSalePriceTier;
import com.mftb.admin.entity.BizFlashSaleRegister;
import com.mftb.admin.entity.BizFlashSaleStats;
import com.mftb.admin.entity.BizFlashSaleSummary;
import com.mftb.admin.entity.BizStore;
import com.mftb.admin.entity.BizStoreBd;
import com.mftb.admin.mapper.BizFlashSalePeriodMapper;
import com.mftb.admin.mapper.BizFlashSalePriceTierMapper;
import com.mftb.admin.mapper.BizFlashSaleRegisterMapper;
import com.mftb.admin.mapper.BizFlashSaleStatsMapper;
import com.mftb.admin.mapper.BizFlashSaleSummaryMapper;
import com.mftb.admin.mapper.BizStoreBdMapper;
import com.mftb.admin.mapper.BizStoreMapper;
import com.mftb.admin.service.FlashSaleService;
import com.mftb.admin.service.SysConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 秒杀模块服务实现
 * <p>
 * 数据流: 登记 -> 统计 -> 汇总；期数为核心维度；门店/BD 引用门店管理校验与自动带出。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FlashSaleServiceImpl implements FlashSaleService {

    /** 黑榜阈值配置 key（连续3期销量低于该值标记黑榜） */
    private static final String KEY_BLACKLIST_THRESHOLD = "flash_sale_blacklist_threshold";
    /** 黑榜默认阈值 */
    private static final int DEFAULT_BLACKLIST_THRESHOLD = 10;

    private final BizFlashSalePeriodMapper periodMapper;
    private final BizFlashSaleRegisterMapper registerMapper;
    private final BizFlashSalePriceTierMapper tierMapper;
    private final BizFlashSaleStatsMapper statsMapper;
    private final BizFlashSaleSummaryMapper summaryMapper;
    private final BizStoreMapper storeMapper;
    private final BizStoreBdMapper storeBdMapper;
    private final SysConfigService sysConfigService;

    /* ─────────────── 期数 ─────────────── */

    @Override
    public List<BizFlashSalePeriod> listPeriods() {
        return periodMapper.selectList(new LambdaQueryWrapper<BizFlashSalePeriod>()
                .orderByDesc(BizFlashSalePeriod::getPeriodNo));
    }

    /** 解析期数: 指定期数不存在时自动创建（导入场景）；null 时取最新一期 */
    private BizFlashSalePeriod resolvePeriod(Integer periodNo, boolean createIfAbsent) {
        if (periodNo != null) {
            BizFlashSalePeriod period = periodMapper.selectOne(new LambdaQueryWrapper<BizFlashSalePeriod>()
                    .eq(BizFlashSalePeriod::getPeriodNo, periodNo).last("LIMIT 1"));
            if (period != null) {
                return period;
            }
            if (!createIfAbsent) {
                return null;
            }
            period = new BizFlashSalePeriod();
            period.setPeriodNo(periodNo);
            period.setStatus(2);
            period.setRemark("第" + periodNo + "期秒杀");
            periodMapper.insert(period);
            return period;
        }
        List<BizFlashSalePeriod> all = listPeriods();
        return all.isEmpty() ? null : all.get(0);
    }

    /* ─────────────── 登记 ─────────────── */

    @Override
    public PageResult<FlashSaleDTOs.RegisterVO> listRegisters(Integer periodNo, String subsidyType, String productType,
                                                              String bd, String keyword, long page, long size) {
        BizFlashSalePeriod period = resolvePeriod(periodNo, false);
        if (period == null) {
            return new PageResult<>(List.of(), 0L);
        }
        LambdaQueryWrapper<BizFlashSaleRegister> wrapper = new LambdaQueryWrapper<BizFlashSaleRegister>()
                .eq(BizFlashSaleRegister::getPeriodId, period.getId())
                .eq(StringUtils.hasText(subsidyType), BizFlashSaleRegister::getSubsidyType, subsidyType)
                .eq(StringUtils.hasText(productType), BizFlashSaleRegister::getProductType, productType)
                .like(StringUtils.hasText(bd), BizFlashSaleRegister::getBdNames, bd)
                .and(StringUtils.hasText(keyword), w -> w
                        .like(BizFlashSaleRegister::getProductId, keyword)
                        .or().like(BizFlashSaleRegister::getProductName, keyword))
                .orderByAsc(BizFlashSaleRegister::getSeqNo);
        Page<BizFlashSaleRegister> p = registerMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);

        Set<String> blacklist = computeBlacklist(period.getId(), loadBlacklistThreshold());
        List<Long> ids = p.getRecords().stream().map(BizFlashSaleRegister::getId).toList();
        Map<Long, List<FlashSaleDTOs.Tier>> tierMap = loadTiers("register", ids);

        List<FlashSaleDTOs.RegisterVO> vos = p.getRecords().stream().map(r -> {
            FlashSaleDTOs.RegisterVO vo = new FlashSaleDTOs.RegisterVO();
            vo.setId(r.getId());
            vo.setPeriodNo(period.getPeriodNo());
            vo.setSeqNo(r.getSeqNo());
            vo.setSubsidyType(r.getSubsidyType());
            vo.setStoreCodes(r.getStoreCodes());
            vo.setStoreNames(r.getStoreNames());
            vo.setBdNames(r.getBdNames());
            vo.setProductId(r.getProductId());
            vo.setProductName(r.getProductName());
            vo.setProductType(r.getProductType());
            vo.setMaxPurchase(r.getMaxPurchase());
            vo.setPriceType(r.getPriceType());
            vo.setOriginalPrice(r.getOriginalPrice());
            vo.setGroupPrice(r.getGroupPrice());
            vo.setFlashSalePrice(r.getFlashSalePrice());
            vo.setFlashSaleStock(r.getFlashSaleStock());
            vo.setCurrentSales(r.getCurrentSales());
            vo.setBlacklist(blacklist.contains(r.getProductId()));
            vo.setTiers(tierMap.getOrDefault(r.getId(), List.of()));
            return vo;
        }).toList();
        return new PageResult<>(vos, p.getTotal());
    }

    @Override
    @Transactional
    public FlashSaleDTOs.ImportResultVO importRegisters(Integer periodNo, List<FlashSaleDTOs.RegisterRow> rows) {
        List<FlashSaleDTOs.ImportError> errors = new ArrayList<>();
        if (rows == null || rows.isEmpty()) {
            return new FlashSaleDTOs.ImportResultVO(0, errors);
        }
        BizFlashSalePeriod period = resolvePeriod(periodNo, true);
        // 门店名称 -> 门店（引用校验）
        Map<String, BizStore> storeByName = storeMapper.selectList(new LambdaQueryWrapper<BizStore>()).stream()
                .collect(Collectors.toMap(s -> s.getStoreName() == null ? "" : s.getStoreName().trim(),
                        s -> s, (a, b) -> a));
        int success = 0;
        for (int i = 0; i < rows.size(); i++) {
            FlashSaleDTOs.RegisterRow row = rows.get(i);
            int line = i + 1;
            if (!StringUtils.hasText(row.getProductId())) {
                errors.add(new FlashSaleDTOs.ImportError(line, "商品ID為空"));
                continue;
            }
            if (!StringUtils.hasText(row.getSubsidyType())) {
                errors.add(new FlashSaleDTOs.ImportError(line, "補貼類型為空"));
                continue;
            }
            // 门店引用校验 + BD 自动带出
            List<String> names = splitNames(row.getStoreNames());
            List<String> codes = new ArrayList<>();
            List<Long> storeIds = new ArrayList<>();
            List<String> unmatched = new ArrayList<>();
            for (String name : names) {
                BizStore store = storeByName.get(name);
                if (store == null) {
                    unmatched.add(name);
                } else {
                    codes.add(store.getStoreCode());
                    storeIds.add(store.getId());
                }
            }
            if (!unmatched.isEmpty()) {
                errors.add(new FlashSaleDTOs.ImportError(line,
                        "門店不在門店管理: " + String.join("、", unmatched)));
                continue;
            }
            String bdNames = loadBdNames(storeIds);

            BizFlashSaleRegister entity = registerMapper.selectOne(new LambdaQueryWrapper<BizFlashSaleRegister>()
                    .eq(BizFlashSaleRegister::getPeriodId, period.getId())
                    .eq(BizFlashSaleRegister::getProductId, row.getProductId().trim()).last("LIMIT 1"));
            boolean isNew = entity == null;
            if (isNew) {
                entity = new BizFlashSaleRegister();
                entity.setPeriodId(period.getId());
                entity.setProductId(row.getProductId().trim());
            }
            entity.setSeqNo(row.getSeqNo());
            entity.setSubsidyType(row.getSubsidyType());
            entity.setStoreCodes(String.join(",", codes));
            entity.setStoreNames(String.join(",", names));
            entity.setBdNames(bdNames);
            entity.setProductName(row.getProductName());
            entity.setProductType(row.getProductType());
            entity.setMaxPurchase(row.getMaxPurchase());
            boolean hasTiers = row.getTiers() != null && !row.getTiers().isEmpty();
            entity.setPriceType(hasTiers ? "tier" : "single");
            entity.setOriginalPrice(row.getOriginalPrice());
            entity.setGroupPrice(row.getGroupPrice());
            entity.setFlashSalePrice(row.getFlashSalePrice());
            entity.setFlashSaleStock(row.getFlashSaleStock());
            if (row.getCurrentSales() != null) {
                entity.setCurrentSales(row.getCurrentSales());
            }
            if (isNew) {
                registerMapper.insert(entity);
            } else {
                registerMapper.updateById(entity);
            }
            saveTiers("register", entity.getId(), row.getTiers());
            success++;
        }
        log.info("秒杀登记导入完成: period={}, success={}, failed={}", periodNo, success, errors.size());
        return new FlashSaleDTOs.ImportResultVO(success, errors);
    }

    /* ─────────────── 统计 ─────────────── */

    @Override
    public PageResult<FlashSaleDTOs.StatsVO> listStats(Integer periodNo, String subsidyType, String bd,
                                                       String keyword, long page, long size) {
        BizFlashSalePeriod period = resolvePeriod(periodNo, false);
        if (period == null) {
            return new PageResult<>(List.of(), 0L);
        }
        LambdaQueryWrapper<BizFlashSaleStats> wrapper = new LambdaQueryWrapper<BizFlashSaleStats>()
                .eq(BizFlashSaleStats::getPeriodId, period.getId())
                .eq(StringUtils.hasText(subsidyType), BizFlashSaleStats::getSubsidyType, subsidyType)
                .like(StringUtils.hasText(bd), BizFlashSaleStats::getBdName, bd)
                .and(StringUtils.hasText(keyword), w -> w
                        .like(BizFlashSaleStats::getProductId, keyword)
                        .or().like(BizFlashSaleStats::getProductName, keyword))
                .orderByDesc(BizFlashSaleStats::getTotalPrice);
        Page<BizFlashSaleStats> p = statsMapper.selectPage(
                new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size)), wrapper);
        List<Long> ids = p.getRecords().stream().map(BizFlashSaleStats::getId).toList();
        Map<Long, List<FlashSaleDTOs.Tier>> tierMap = loadTiers("stats", ids);

        List<FlashSaleDTOs.StatsVO> vos = p.getRecords().stream().map(s -> {
            FlashSaleDTOs.StatsVO vo = new FlashSaleDTOs.StatsVO();
            vo.setId(s.getId());
            vo.setPeriodNo(period.getPeriodNo());
            vo.setProductId(s.getProductId());
            vo.setProductName(s.getProductName());
            vo.setStoreNames(s.getStoreNames());
            vo.setPriceType(s.getPriceType());
            vo.setFlashSalePrice(s.getFlashSalePrice());
            vo.setOrderUsers(s.getOrderUsers());
            vo.setTotalPrice(s.getTotalPrice());
            vo.setTotalOrders(s.getTotalOrders());
            vo.setTotalSales(s.getTotalSales());
            vo.setActualAmount(s.getActualAmount());
            vo.setOrderUsersChange(s.getOrderUsersChange());
            vo.setTotalPriceChange(s.getTotalPriceChange());
            vo.setTotalOrdersChange(s.getTotalOrdersChange());
            vo.setTotalSalesChange(s.getTotalSalesChange());
            vo.setActualAmountChange(s.getActualAmountChange());
            vo.setSubsidyType(s.getSubsidyType());
            vo.setDiscountRate(s.getDiscountRate());
            vo.setLastPeriodSubsidy(s.getLastPeriodSubsidy());
            vo.setBdName(s.getBdName());
            vo.setTiers(tierMap.getOrDefault(s.getId(), List.of()));
            return vo;
        }).toList();
        return new PageResult<>(vos, p.getTotal());
    }

    @Override
    @Transactional
    public FlashSaleDTOs.ImportResultVO importStats(Integer periodNo, List<FlashSaleDTOs.StatsRow> rows) {
        List<FlashSaleDTOs.ImportError> errors = new ArrayList<>();
        if (rows == null || rows.isEmpty()) {
            return new FlashSaleDTOs.ImportResultVO(0, errors);
        }
        BizFlashSalePeriod period = resolvePeriod(periodNo, true);
        int success = 0;
        for (int i = 0; i < rows.size(); i++) {
            FlashSaleDTOs.StatsRow row = rows.get(i);
            int line = i + 1;
            if (!StringUtils.hasText(row.getProductId())) {
                errors.add(new FlashSaleDTOs.ImportError(line, "商品ID為空"));
                continue;
            }
            BizFlashSaleStats entity = statsMapper.selectOne(new LambdaQueryWrapper<BizFlashSaleStats>()
                    .eq(BizFlashSaleStats::getPeriodId, period.getId())
                    .eq(BizFlashSaleStats::getProductId, row.getProductId().trim()).last("LIMIT 1"));
            boolean isNew = entity == null;
            if (isNew) {
                entity = new BizFlashSaleStats();
                entity.setPeriodId(period.getId());
                entity.setProductId(row.getProductId().trim());
            }
            entity.setProductName(row.getProductName());
            entity.setStoreNames(row.getStoreNames());
            entity.setPriceType(row.getPriceType());
            entity.setFlashSalePrice(row.getFlashSalePrice());
            entity.setOrderUsers(row.getOrderUsers());
            entity.setTotalPrice(row.getTotalPrice());
            entity.setTotalOrders(row.getTotalOrders());
            entity.setTotalSales(row.getTotalSales());
            entity.setActualAmount(row.getActualAmount());
            entity.setOrderUsersChange(row.getOrderUsersChange());
            entity.setTotalPriceChange(row.getTotalPriceChange());
            entity.setTotalOrdersChange(row.getTotalOrdersChange());
            entity.setTotalSalesChange(row.getTotalSalesChange());
            entity.setActualAmountChange(row.getActualAmountChange());
            entity.setSubsidyType(row.getSubsidyType());
            entity.setDiscountRate(row.getDiscountRate());
            entity.setLastPeriodSubsidy(row.getLastPeriodSubsidy());
            entity.setBdName(row.getBdName());
            if (isNew) {
                statsMapper.insert(entity);
            } else {
                statsMapper.updateById(entity);
            }
            saveTiers("stats", entity.getId(), row.getTiers());
            // 回填登记.current_sales
            BizFlashSaleRegister reg = registerMapper.selectOne(new LambdaQueryWrapper<BizFlashSaleRegister>()
                    .eq(BizFlashSaleRegister::getPeriodId, period.getId())
                    .eq(BizFlashSaleRegister::getProductId, row.getProductId().trim()).last("LIMIT 1"));
            if (reg != null && row.getTotalSales() != null) {
                reg.setCurrentSales(row.getTotalSales());
                registerMapper.updateById(reg);
            }
            success++;
        }
        log.info("秒杀统计导入完成: period={}, success={}, failed={}", periodNo, success, errors.size());
        return new FlashSaleDTOs.ImportResultVO(success, errors);
    }

    /* ─────────────── 汇总/总览 ─────────────── */

    @Override
    @Transactional
    public FlashSaleDTOs.ImportResultVO importSummary(Integer periodNo, List<FlashSaleDTOs.SummaryRow> rows) {
        List<FlashSaleDTOs.ImportError> errors = new ArrayList<>();
        if (rows == null || rows.isEmpty()) {
            return new FlashSaleDTOs.ImportResultVO(0, errors);
        }
        BizFlashSalePeriod period = resolvePeriod(periodNo, true);
        int success = 0;
        for (int i = 0; i < rows.size(); i++) {
            FlashSaleDTOs.SummaryRow row = rows.get(i);
            if (row.getStatDate() == null) {
                // 合计行: 先清理旧合计再插入
                summaryMapper.delete(new LambdaQueryWrapper<BizFlashSaleSummary>()
                        .eq(BizFlashSaleSummary::getPeriodId, period.getId())
                        .isNull(BizFlashSaleSummary::getStatDate));
            }
            BizFlashSaleSummary entity = new BizFlashSaleSummary();
            entity.setPeriodId(period.getId());
            entity.setStatDate(row.getStatDate());
            fillSummary(entity, row);
            if (row.getStatDate() != null) {
                BizFlashSaleSummary exist = summaryMapper.selectOne(new LambdaQueryWrapper<BizFlashSaleSummary>()
                        .eq(BizFlashSaleSummary::getPeriodId, period.getId())
                        .eq(BizFlashSaleSummary::getStatDate, row.getStatDate()).last("LIMIT 1"));
                if (exist != null) {
                    entity.setId(exist.getId());
                    summaryMapper.updateById(entity);
                } else {
                    summaryMapper.insert(entity);
                }
            } else {
                summaryMapper.insert(entity);
            }
            success++;
        }
        log.info("秒杀汇总导入完成: period={}, success={}", periodNo, success);
        return new FlashSaleDTOs.ImportResultVO(success, errors);
    }

    @Override
    public FlashSaleDTOs.OverviewVO overview(Integer periodNo) {
        FlashSaleDTOs.OverviewVO vo = new FlashSaleDTOs.OverviewVO();
        BizFlashSalePeriod period = resolvePeriod(periodNo, false);
        if (period == null) {
            return vo;
        }
        vo.setPeriodNo(period.getPeriodNo());
        List<BizFlashSaleSummary> all = summaryMapper.selectList(new LambdaQueryWrapper<BizFlashSaleSummary>()
                .eq(BizFlashSaleSummary::getPeriodId, period.getId()));
        BizFlashSaleSummary totals = all.stream().filter(s -> s.getStatDate() == null).findFirst().orElse(null);
        List<BizFlashSaleSummary> daily = all.stream().filter(s -> s.getStatDate() != null)
                .sorted(Comparator.comparing(BizFlashSaleSummary::getStatDate)).toList();

        // 上期（period_no 小于当前且存在汇总数据的最近一期）
        List<BizFlashSaleSummary> prevDaily = List.of();
        BizFlashSaleSummary prevTotals = null;
        List<BizFlashSalePeriod> periods = listPeriods();
        for (BizFlashSalePeriod p : periods) {
            if (p.getPeriodNo() >= period.getPeriodNo()) {
                continue;
            }
            List<BizFlashSaleSummary> pAll = summaryMapper.selectList(new LambdaQueryWrapper<BizFlashSaleSummary>()
                    .eq(BizFlashSaleSummary::getPeriodId, p.getId()));
            if (pAll.isEmpty()) {
                continue;
            }
            prevTotals = pAll.stream().filter(s -> s.getStatDate() == null).findFirst().orElse(null);
            prevDaily = pAll.stream().filter(s -> s.getStatDate() != null)
                    .sorted(Comparator.comparing(BizFlashSaleSummary::getStatDate)).toList();
            break;
        }

        vo.setTotals(toDayVO(totals, prevTotals));
        List<FlashSaleDTOs.SummaryDayVO> dailyVos = new ArrayList<>();
        for (int i = 0; i < daily.size(); i++) {
            BizFlashSaleSummary prev = i < prevDaily.size() ? prevDaily.get(i) : null;
            dailyVos.add(toDayVO(daily.get(i), prev));
        }
        vo.setDaily(dailyVos);
        return vo;
    }

    private FlashSaleDTOs.SummaryDayVO toDayVO(BizFlashSaleSummary cur, BizFlashSaleSummary prev) {
        if (cur == null) {
            return null;
        }
        FlashSaleDTOs.SummaryDayVO vo = new FlashSaleDTOs.SummaryDayVO();
        vo.setStatDate(cur.getStatDate());
        vo.setTotals(cur.getStatDate() == null);
        vo.setTotalPayable(cur.getTotalPayable());
        vo.setTotalActual(cur.getTotalActual());
        vo.setTotalOrders(cur.getTotalOrders());
        vo.setTotalSales(cur.getTotalSales());
        vo.setTotalProducts(cur.getTotalProducts());
        vo.setSoldProducts(cur.getSoldProducts());
        vo.setSoldRate(rate(toBigDecimal(cur.getSoldProducts()), toBigDecimal(cur.getTotalProducts())));
        vo.setBuyers(cur.getBuyers());
        vo.setRepurchaseBuyers(cur.getRepurchaseBuyers());
        vo.setRepurchaseRate(cur.getRepurchaseRate());
        vo.setAvgOrderValue(cur.getAvgOrderValue());
        if (prev != null) {
            vo.setPayableChange(change(cur.getTotalPayable(), prev.getTotalPayable()));
            vo.setActualChange(change(cur.getTotalActual(), prev.getTotalActual()));
            vo.setOrdersChange(change(toBigDecimal(cur.getTotalOrders()), toBigDecimal(prev.getTotalOrders())));
            vo.setSalesChange(change(toBigDecimal(cur.getTotalSales()), toBigDecimal(prev.getTotalSales())));
            vo.setBuyersChange(change(toBigDecimal(cur.getBuyers()), toBigDecimal(prev.getBuyers())));
        }
        return vo;
    }

    private static void fillSummary(BizFlashSaleSummary entity, FlashSaleDTOs.SummaryRow row) {
        entity.setTotalPayable(row.getTotalPayable());
        entity.setTotalActual(row.getTotalActual());
        entity.setTotalOrders(row.getTotalOrders());
        entity.setTotalSales(row.getTotalSales());
        entity.setTotalProducts(row.getTotalProducts());
        entity.setSoldProducts(row.getSoldProducts());
        entity.setBuyers(row.getBuyers());
        entity.setRepurchaseBuyers(row.getRepurchaseBuyers());
        entity.setRepurchaseRate(row.getRepurchaseRate());
        entity.setAvgOrderValue(row.getAvgOrderValue());
    }

    /* ─────────────── 通用工具 ─────────────── */

    /** 批量加载阶梯并按 ownerId 分组 */
    private Map<Long, List<FlashSaleDTOs.Tier>> loadTiers(String ownerType, List<Long> ownerIds) {
        if (ownerIds == null || ownerIds.isEmpty()) {
            return Map.of();
        }
        List<BizFlashSalePriceTier> tiers = tierMapper.selectList(new LambdaQueryWrapper<BizFlashSalePriceTier>()
                .eq(BizFlashSalePriceTier::getOwnerType, ownerType)
                .in(BizFlashSalePriceTier::getOwnerId, ownerIds)
                .orderByAsc(BizFlashSalePriceTier::getTierNo));
        Map<Long, List<FlashSaleDTOs.Tier>> map = new HashMap<>();
        for (BizFlashSalePriceTier t : tiers) {
            FlashSaleDTOs.Tier dto = new FlashSaleDTOs.Tier();
            dto.setTierNo(t.getTierNo());
            dto.setTierPrice(t.getTierPrice());
            dto.setTierStock(t.getTierStock());
            dto.setTierSubsidy(t.getTierSubsidy());
            map.computeIfAbsent(t.getOwnerId(), k -> new ArrayList<>()).add(dto);
        }
        return map;
    }

    /** 先删后插保存阶梯 */
    private void saveTiers(String ownerType, Long ownerId, List<FlashSaleDTOs.Tier> tiers) {
        tierMapper.delete(new LambdaQueryWrapper<BizFlashSalePriceTier>()
                .eq(BizFlashSalePriceTier::getOwnerType, ownerType)
                .eq(BizFlashSalePriceTier::getOwnerId, ownerId));
        if (tiers == null) {
            return;
        }
        int no = 1;
        for (FlashSaleDTOs.Tier t : tiers) {
            BizFlashSalePriceTier entity = new BizFlashSalePriceTier();
            entity.setOwnerType(ownerType);
            entity.setOwnerId(ownerId);
            entity.setTierNo(t.getTierNo() != null ? t.getTierNo() : no);
            entity.setTierPrice(t.getTierPrice() != null ? t.getTierPrice() : BigDecimal.ZERO);
            entity.setTierStock(t.getTierStock() != null ? t.getTierStock() : 0);
            entity.setTierSubsidy(t.getTierSubsidy());
            tierMapper.insert(entity);
            no++;
        }
    }

    /** 门店ID集合 -> BD姓名并集（保持绑定顺序） */
    private String loadBdNames(List<Long> storeIds) {
        if (storeIds.isEmpty()) {
            return "";
        }
        List<BizStoreBd> binds = storeBdMapper.selectList(new LambdaQueryWrapper<BizStoreBd>()
                .in(BizStoreBd::getStoreId, storeIds).orderByAsc(BizStoreBd::getId));
        Map<String, Boolean> dedup = new LinkedHashMap<>();
        for (BizStoreBd b : binds) {
            if (StringUtils.hasText(b.getBdName())) {
                dedup.putIfAbsent(b.getBdName(), true);
            }
        }
        return String.join(",", dedup.keySet());
    }

    /** 拆分门店名称（兼容 , ， ; ； 分隔） */
    private List<String> splitNames(String raw) {
        if (!StringUtils.hasText(raw)) {
            return List.of();
        }
        List<String> names = new ArrayList<>();
        for (String part : raw.split("[,，;；]")) {
            String name = part.trim();
            if (!name.isEmpty()) {
                names.add(name);
            }
        }
        return names;
    }

    /** 黑榜: 最近3期均有统计且销量均低于阈值的商品 */
    private Set<String> computeBlacklist(Long periodId, int threshold) {
        List<BizFlashSalePeriod> periods = listPeriods();
        List<Map<String, Integer>> recent = new ArrayList<>();
        for (BizFlashSalePeriod p : periods) {
            List<BizFlashSaleStats> stats = statsMapper.selectList(new LambdaQueryWrapper<BizFlashSaleStats>()
                    .eq(BizFlashSaleStats::getPeriodId, p.getId()));
            if (stats.isEmpty()) {
                continue;
            }
            recent.add(stats.stream().collect(Collectors.toMap(BizFlashSaleStats::getProductId,
                    s -> s.getTotalSales() != null ? s.getTotalSales() : 0, (a, b) -> a)));
            if (recent.size() >= 3) {
                break;
            }
        }
        if (recent.size() < 3) {
            return Set.of();
        }
        Set<String> result = new HashSet<>();
        for (String productId : recent.get(0).keySet()) {
            boolean allLow = recent.stream().allMatch(m -> {
                Integer sales = m.get(productId);
                return sales != null && sales < threshold;
            });
            if (allLow) {
                result.add(productId);
            }
        }
        return result;
    }

    private int loadBlacklistThreshold() {
        String value = sysConfigService.getConfigValue(KEY_BLACKLIST_THRESHOLD);
        if (StringUtils.hasText(value)) {
            try {
                return Integer.parseInt(value.trim());
            } catch (NumberFormatException e) {
                log.warn("黑榜阈值配置格式错误: {}", value);
            }
        }
        return DEFAULT_BLACKLIST_THRESHOLD;
    }

    private static BigDecimal toBigDecimal(Integer v) {
        return v == null ? null : BigDecimal.valueOf(v);
    }

    /** 环比: (cur - prev) / prev，保留4位；prev 为空或 0 时返回 null */
    private static BigDecimal change(BigDecimal cur, BigDecimal prev) {
        if (cur == null || prev == null || prev.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        return cur.subtract(prev).divide(prev, 4, RoundingMode.HALF_UP);
    }

    /** 比率: a / b，保留4位；b 为空或 0 时返回 null */
    private static BigDecimal rate(BigDecimal a, BigDecimal b) {
        if (a == null || b == null || b.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        return a.divide(b, 4, RoundingMode.HALF_UP);
    }
}
