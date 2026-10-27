package com.mftb.admin.service.impl;

import com.mftb.admin.dto.*;
import com.mftb.admin.entity.EamConsumableItem;
import com.mftb.admin.mapper.EamConsumableItemMapper;
import com.mftb.admin.mapper.EamConsumableReportMapper;
import com.mftb.admin.service.EamConsumableReportService;
import com.mftb.admin.service.SysCompanyBrandService;
import com.mftb.admin.service.SysPurchaseCompanyService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 耗材消耗统计报表服务实现
 * <p>
 * 流水聚合走 SQL（{@link EamConsumableReportMapper}），库存金额为实时值在内存中按公司/耗材维度合并。
 */
@Service
@RequiredArgsConstructor
public class EamConsumableReportServiceImpl implements EamConsumableReportService {

    private final EamConsumableReportMapper reportMapper;
    private final EamConsumableItemMapper consumableItemMapper;
    private final SysCompanyBrandService companyBrandService;
    private final SysPurchaseCompanyService purchaseCompanyService;

    @Override
    public EamConsumableReportSummaryVO summary(EamConsumableReportQuery query) {
        LocalDate start = parseDate(query.getStartDate());
        LocalDate end = parseDate(query.getEndDate());
        EamConsumableReportSummaryVO vo = reportMapper.summary(start, end, query.getCompanyBrand(), query.getPurchaseCompanyId());
        if (vo == null) vo = new EamConsumableReportSummaryVO();
        // 库存实时值
        Map<String, Object> stockTotals = reportMapper.stockTotals(query.getCompanyBrand(), query.getPurchaseCompanyId());
        if (stockTotals != null) {
            vo.setStockQty(toInt(stockTotals.get("stockQty")));
            vo.setStockAmount(toDecimal(stockTotals.get("stockAmount")));
        }
        // 部门/员工数量（有消耗的）
        List<EamConsumableDeptStatVO> depts = reportMapper.statsByDept(start, end, query.getCompanyBrand(), query.getPurchaseCompanyId());
        List<EamConsumableApplicantStatVO> applicants = reportMapper.statsByApplicant(start, end, query.getCompanyBrand(), query.getPurchaseCompanyId());
        vo.setDeptCount(depts == null ? 0 : depts.size());
        vo.setApplicantCount(applicants == null ? 0 : applicants.size());
        return vo;
    }

    @Override
    public List<EamConsumableCompanyStatVO> statsByCompany(EamConsumableReportQuery query) {
        LocalDate start = parseDate(query.getStartDate());
        LocalDate end = parseDate(query.getEndDate());
        List<EamConsumableCompanyStatVO> rows = new java.util.ArrayList<>(reportMapper.statsByCompany(start, end, query.getCompanyBrand(), query.getPurchaseCompanyId()));
        // 库存实时值按 (brand, company) 合并
        Map<String, EamConsumableCompanyStatVO> stockMap = new HashMap<>();
        List<EamConsumableCompanyStatVO> stocks = reportMapper.stockByCompany();
        if (stocks != null) {
            for (EamConsumableCompanyStatVO s : stocks) {
                stockMap.put(stockKey(s.getCompanyBrand(), s.getPurchaseCompanyId()), s);
            }
        }
        for (EamConsumableCompanyStatVO row : rows) {
            row.setCompanyBrandName(row.getCompanyBrand() != null ? companyBrandService.getLabelById(row.getCompanyBrand()) : "待確認");
            row.setPurchaseCompanyName(row.getPurchaseCompanyId() != null
                    ? purchaseCompanyService.getNameById(row.getPurchaseCompanyId()) : "待確認");
            EamConsumableCompanyStatVO s = stockMap.get(stockKey(row.getCompanyBrand(), row.getPurchaseCompanyId()));
            if (s != null) {
                row.setStockQty(s.getStockQty());
                row.setStockAmount(s.getStockAmount());
                stockMap.remove(stockKey(row.getCompanyBrand(), row.getPurchaseCompanyId()));
            }
        }
        // 有库存但期间内无流水的公司也补进列表
        for (EamConsumableCompanyStatVO s : stockMap.values()) {
            s.setCompanyBrandName(s.getCompanyBrand() != null ? companyBrandService.getLabelById(s.getCompanyBrand()) : "待確認");
            s.setPurchaseCompanyName(s.getPurchaseCompanyId() != null
                    ? purchaseCompanyService.getNameById(s.getPurchaseCompanyId()) : "待確認");
            rows.add(s);
        }
        return rows;
    }

    @Override
    public List<EamConsumableDeptStatVO> statsByDept(EamConsumableReportQuery query) {
        List<EamConsumableDeptStatVO> rows = reportMapper.statsByDept(
                parseDate(query.getStartDate()), parseDate(query.getEndDate()),
                query.getCompanyBrand(), query.getPurchaseCompanyId());
        return rows == null ? List.of() : rows;
    }

    @Override
    public List<EamConsumableApplicantStatVO> statsByApplicant(EamConsumableReportQuery query) {
        List<EamConsumableApplicantStatVO> rows = reportMapper.statsByApplicant(
                parseDate(query.getStartDate()), parseDate(query.getEndDate()),
                query.getCompanyBrand(), query.getPurchaseCompanyId());
        return rows == null ? List.of() : rows;
    }

    @Override
    public List<EamConsumableItemStatVO> statsByItem(EamConsumableReportQuery query) {
        LocalDate start = parseDate(query.getStartDate());
        LocalDate end = parseDate(query.getEndDate());
        List<EamConsumableItemStatVO> rows = new java.util.ArrayList<>(reportMapper.statsByItem(
                start, end, query.getCompanyBrand(), query.getPurchaseCompanyId()));
        // 补规格/单位/库存实时值
        Map<Long, EamConsumableItemStatVO> stockMap = new HashMap<>();
        List<EamConsumableItemStatVO> stocks = reportMapper.stockByItem();
        if (stocks != null) stocks.forEach(s -> stockMap.put(s.getItemId(), s));
        for (EamConsumableItemStatVO row : rows) {
            EamConsumableItemStatVO s = stockMap.remove(row.getItemId());
            if (s != null) {
                row.setStockQty(s.getStockQty());
                row.setStockAmount(s.getStockAmount());
            }
        }
        for (EamConsumableItemStatVO s : stockMap.values()) {
            rows.add(s);
        }
        // 從耗材主档批量补齐编码/名称/规格/单位（修复：期间内无流水的耗材行身份字段为空、规格/单位始终缺失）
        enrichItemMaster(rows);
        return rows;
    }

    /** 用耗材主档批量补齐 itemCode/itemName/spec/unit；主档缺失（如已删除）时保留流水快照值。 */
    private void enrichItemMaster(List<EamConsumableItemStatVO> rows) {
        if (rows.isEmpty()) return;
        Set<Long> ids = rows.stream()
                .map(EamConsumableItemStatVO::getItemId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (ids.isEmpty()) return;
        Map<Long, EamConsumableItem> masterMap = consumableItemMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(EamConsumableItem::getId, Function.identity(), (a, b) -> a));
        for (EamConsumableItemStatVO row : rows) {
            EamConsumableItem item = row.getItemId() == null ? null : masterMap.get(row.getItemId());
            if (item == null) continue;
            if (StringUtils.hasText(item.getItemCode())) row.setItemCode(item.getItemCode());
            if (StringUtils.hasText(item.getName())) row.setItemName(item.getName());
            row.setSpec(item.getSpec());
            row.setUnit(item.getUnit());
        }
    }

    /* ==================== 工具 ==================== */

    private static String stockKey(Long brand, Long companyId) {
        return (brand == null ? "-" : brand.toString()) + "|" + (companyId == null ? "-" : companyId.toString());
    }

    private LocalDate parseDate(String value) {
        if (!StringUtils.hasText(value)) return null;
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException e) {
            throw new com.mftb.admin.common.BusinessException("日期格式錯誤，應為 yyyy-MM-dd");
        }
    }

    private static int toInt(Object v) {
        return v instanceof Number n ? n.intValue() : 0;
    }

    private static BigDecimal toDecimal(Object v) {
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        return BigDecimal.ZERO;
    }
}
