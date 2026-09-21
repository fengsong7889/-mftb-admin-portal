package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamAssetService;
import com.mftb.admin.service.SysCompanyBrandService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamAssetServiceImpl implements EamAssetService {
    private final EamAssetMapper assetMapper;
    private final EamInboundBatchMapper batchMapper;
    private final EamLocationMapper locationMapper;
    private final EamModelMapper modelMapper;
    private final EamCategoryMapper categoryMapper;
    private final EamBrandMapper brandMapper;
    private final EamPurchaseOrderMapper purchaseOrderMapper;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;
    private final JdbcTemplate jdbcTemplate;
    private final SysCompanyBrandService companyBrandService;
    private final com.mftb.admin.service.EamTransferLookup transferLookup;
    private static final Set<String> STATUSES = Set.of("idle", "in_use", "in_repair", "scrapped", "lost", "pending_inspection", "pending_disposal", "written_off");

    @Override
    public PageResult<EamAssetVO> page(EamAssetQuery query) {
        Page<EamAsset> page = assetMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                queryWrapper(query).orderByDesc(EamAsset::getCreatedAt, EamAsset::getId));
        List<Long> batchIds = page.getRecords().stream().map(EamAsset::getBatchId).filter(Objects::nonNull).distinct().toList();
        Map<Long, EamInboundBatch> batches = batchIds.isEmpty() ? Map.of() : batchMapper.selectBatchIds(batchIds)
                .stream().collect(Collectors.toMap(EamInboundBatch::getId, b -> b));
        List<Long> locationIds = page.getRecords().stream().map(EamAsset::getLocationId).filter(Objects::nonNull).distinct().toList();
        Map<Long, EamLocation> locations = locationIds.isEmpty() ? Map.of() : locationMapper.selectBatchIds(locationIds)
                .stream().collect(Collectors.toMap(EamLocation::getId, l -> l));
        List<Long> orderIds = page.getRecords().stream().map(EamAsset::getOrderId).filter(Objects::nonNull).distinct().toList();
        Map<Long, EamPurchaseOrder> orders = orderIds.isEmpty() ? Map.of() : purchaseOrderMapper.selectBatchIds(orderIds)
                .stream().collect(Collectors.toMap(EamPurchaseOrder::getId, o -> o));

        // 批量加載型號 & 品牌，用於品牌名稱回退解析（避免 N+1 逐條查詢）
        List<Long> modelIds = page.getRecords().stream()
                .filter(a -> (a.getBrand() == null || a.getBrand().isBlank()) && a.getModelId() != null)
                .map(EamAsset::getModelId).distinct().toList();
        Map<Long, EamModel> modelMap = modelIds.isEmpty() ? Map.of() : modelMapper.selectBatchIds(modelIds)
                .stream().collect(Collectors.toMap(EamModel::getId, m -> m));
        List<Long> brandIds = page.getRecords().stream()
                .filter(a -> (a.getBrand() == null || a.getBrand().isBlank()) && a.getBrandId() != null)
                .map(EamAsset::getBrandId).distinct().toList();
        Map<Long, EamBrand> brandMap = brandIds.isEmpty() ? Map.of() : brandMapper.selectBatchIds(brandIds)
                .stream().collect(Collectors.toMap(EamBrand::getId, b -> b));

        return new PageResult<>(page.getRecords().stream().map(a -> toVO(a,
                a.getBatchId() == null ? null : batches.get(a.getBatchId()),
                a.getLocationId() == null ? null : locations.get(a.getLocationId()),
                a.getOrderId() == null ? null : orders.get(a.getOrderId()),
                modelMap, brandMap
        )).toList(), page.getTotal());
    }

    @Override
    public Map<String, Long> statusCounts(EamAssetQuery query) {
        Map<String, Long> counts = new LinkedHashMap<>();
        // 独立 COUNT 查询，不依赖分页上限或携带大体积图片的全量列表。
        LambdaQueryWrapper<EamAsset> all = queryWrapper(query);
        counts.put("all", assetMapper.selectCount(all));
        for (String status : STATUSES) {
            counts.put(status, assetMapper.selectCount(queryWrapper(query).eq(EamAsset::getStatus, status)));
        }
        return counts;
    }

    @Override
    public EamAssetVO detail(long id) {
        EamAsset asset = requireAsset(id);
        EamLocation location = asset.getLocationId() == null ? null : locationMapper.selectById(asset.getLocationId());
        EamPurchaseOrder order = asset.getOrderId() == null ? null : purchaseOrderMapper.selectById(asset.getOrderId());
        return toVO(asset, asset.getBatchId() == null ? null : batchMapper.selectById(asset.getBatchId()), location, order);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long create(EamAssetSaveDTO dto) {
        EamAsset asset = new EamAsset();
        asset.setStatus("idle");
        asset.setSource("self");
        asset.setHoldType("owned");
        asset.setPurchaseValue(BigDecimal.ZERO);
        apply(dto, asset);
        if (!hasText(asset.getAssetNo())) {
            asset.setAssetNo(generateAssetNo(asset.getCompanyBrand(), asset.getLocationId(), asset.getCategoryCode()));
        }
        validate(asset);
        if (!isAssetNoUnique(asset.getAssetNo(), null)) throw new BusinessException("資產編號已存在");
        try {
            assetMapper.insert(asset);
        } catch (DuplicateKeyException e) {
            throw new BusinessException("資產編號已存在");
        }
        return asset.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void update(long id, EamAssetSaveDTO dto) {
        EamAsset asset = assetMapper.selectOne(new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, id).last("FOR UPDATE"));
        if (asset == null) throw new BusinessException("資產不存在");
        // 领用状态机保护：有活跃领用的资产不可编辑
        if (asset.getActiveClaimId() != null) {
            throw new BusinessException("該資產正在領用中，不可編輯；請先歸還後再修改");
        }
        if (asset.getBatchId() != null && dto.getAssetNo() != null && !Objects.equals(asset.getAssetNo(), dto.getAssetNo().trim())) {
            throw new BusinessException("驗收入庫資產編號不可修改");
        }
        apply(dto, asset);
        validate(asset);
        if (!isAssetNoUnique(asset.getAssetNo(), id)) throw new BusinessException("資產編號已存在");
        try {
            assetMapper.updateById(asset);
        } catch (DuplicateKeyException e) {
            throw new BusinessException("資產編號已存在");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        EamAsset asset = assetMapper.selectOne(new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, id).last("FOR UPDATE"));
        if (asset == null) throw new BusinessException("資產不存在");
        if (asset.getActiveClaimId() != null) {
            throw new BusinessException("該資產正在領用中，不可刪除；請先歸還後再刪除");
        }
        if (!"idle".equals(asset.getStatus())) throw new BusinessException("僅閒置資產可刪除");
        assetMapper.deleteById(id);
    }

    @Override
    public boolean isAssetNoUnique(String assetNo, Long excludeId) {
        if (!hasText(assetNo)) return false;
        // 唯一键包含软删除记录，已使用过的编号不可复用。
        return assetMapper.countAssetNo(assetNo.trim(), excludeId) == 0;
    }

    private EamAsset requireAsset(long id) {
        EamAsset asset = assetMapper.selectById(id);
        if (asset == null) throw new BusinessException("資產不存在");
        return asset;
    }

    private void apply(EamAssetSaveDTO dto, EamAsset asset) {
        if (dto.getQuantity() != null && dto.getQuantity() != 1) throw new BusinessException("資產台賬採用一物一碼，數量必須為 1");
        BeanWrapper source = new BeanWrapperImpl(dto);
        List<String> ignored = new ArrayList<>(List.of("params", "rentalPeriod", "accessories"));
        Arrays.stream(source.getPropertyDescriptors()).forEach(p -> {
            if (source.getPropertyValue(p.getName()) == null) ignored.add(p.getName());
        });
        // 仅复制 DTO 白名单中的非空字段，部分更新不会清空来源及未提交的值。
        BeanUtils.copyProperties(dto, asset, ignored.toArray(String[]::new));
        if (dto.getParams() != null) asset.setParams(JsonUtils.toJson(dto.getParams()));
        if (dto.getAccessories() != null) asset.setAccessories(JsonUtils.toJson(dto.getAccessories()));
        if (dto.getRentalPeriod() != null) {
            if (!dto.getRentalPeriod().isEmpty() && dto.getRentalPeriod().size() != 2) throw new BusinessException("租賃期間需包含起止日期");
            dto.getRentalPeriod().forEach(this::validateDate);
            asset.setRentalPeriod(JsonUtils.toJson(dto.getRentalPeriod()));
        }
        if (dto.getModelId() != null) {
            EamModel model = modelMapper.selectById(dto.getModelId());
            if (model == null) throw new BusinessException("型號不存在");
            asset.setAssetName(model.getName());
            asset.setUnit(model.getUnit());
            asset.setCategoryCode(model.getCategoryCode());
            asset.setBrandId(model.getBrandId());
            asset.setBrand(model.getBrandZh());
        }
        if (dto.getCategoryCode() != null || dto.getCategoryId() != null || dto.getModelId() != null) {
            EamCategory category = hasText(asset.getCategoryCode())
                    ? categoryMapper.selectOne(new LambdaQueryWrapper<EamCategory>().eq(EamCategory::getCode, asset.getCategoryCode()))
                    : categoryMapper.selectById(asset.getCategoryId());
            if (category == null) throw new BusinessException("分類不存在");
            asset.setCategoryId(category.getId());
            asset.setCategoryCode(category.getCode());
            asset.setAssetType(category.getName());
        }
        if (dto.getBrandId() != null && dto.getModelId() == null) {
            EamBrand brand = brandMapper.selectById(dto.getBrandId());
            if (brand == null) throw new BusinessException("品牌不存在");
            asset.setBrand(brand.getBrandZh());
        }
        if (dto.getLocationId() != null) {
            EamLocation location = locationMapper.selectById(dto.getLocationId());
            if (location == null) throw new BusinessException("存放位置不存在");
            String addrParts = Arrays.stream(new String[]{location.getCity(), location.getDistrict(), location.getAddress()})
                    .filter(s -> s != null && !s.isBlank())
                    .collect(Collectors.joining());
            asset.setLocation(addrParts.isEmpty() ? location.getName() : location.getName() + "\uFF08" + addrParts + "\uFF09");
        }
        asset.setPurchaseType("lease".equals(asset.getSource()) ? "lease" : "purchase");
        if (asset.getAssetNo() != null) asset.setAssetNo(asset.getAssetNo().trim());
        asset.setUpdatedBy(operatorResolver.currentOperatorName());
        asset.setUpdatedAt(java.time.LocalDateTime.now());
    }

    private void validate(EamAsset asset) {
        if (!hasText(asset.getAssetName()) || !hasText(asset.getAssetType())) throw new BusinessException("資產名稱及分類不能為空");
        if (!hasText(asset.getAssetNo()) || asset.getAssetNo().length() > 64) throw new BusinessException("資產編號長度需為 1 至 64 字元");
        if (!STATUSES.contains(asset.getStatus())) throw new BusinessException("無效的資產狀態");
        if (!Set.of("self", "lease").contains(asset.getSource())) throw new BusinessException("無效的採購形式");
        if (!Set.of("owned", "borrowed").contains(asset.getHoldType())) throw new BusinessException("無效的持有方式");
        if (asset.getPurchaseValue() != null && asset.getPurchaseValue().signum() < 0) throw new BusinessException("購買價值不能為負數");
        validateDate(asset.getPurchaseDate());
        validateDate(asset.getUsageDate());
        validateDate(asset.getScrapTime());
    }

    private EamAssetVO toVO(EamAsset asset, EamInboundBatch batch, EamLocation location, EamPurchaseOrder order) {
        return toVO(asset, batch, location, order, Map.of(), Map.of());
    }

    /**
     * 帶預加載型號/品牌映射的 toVO，列表頁使用批量加載避免 N+1。
     * 若 modelMap/brandMap 為空，則回退到逐條查詢。
     */
    private EamAssetVO toVO(EamAsset asset, EamInboundBatch batch, EamLocation location, EamPurchaseOrder order,
                            Map<Long, EamModel> modelMap, Map<Long, EamBrand> brandMap) {
        EamAssetVO vo = new EamAssetVO();
        BeanUtils.copyProperties(asset, vo, "params", "rentalPeriod", "accessories", "createdAt", "updatedAt");
        Map<String, String> params = new LinkedHashMap<>();
        JsonUtils.parseMap(asset.getParams()).forEach((key, value) -> params.put(key, Objects.toString(value, "")));
        vo.setParams(params);
        vo.setRentalPeriod(JsonUtils.parseStringList(asset.getRentalPeriod()));
        vo.setAccessories(asset.getAccessories() != null ? JsonUtils.parseMapList(asset.getAccessories()) : List.of());
        vo.setQuantity(1);
        vo.setApplicant(Objects.toString(asset.getUpdatedBy(), ""));
        vo.setCreatedAt(DateTimeUtils.format(asset.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(asset.getUpdatedAt()));
        // 品牌為空時從型號回退解析（優先使用預加載映射，否則逐條查詢）
        if ((vo.getBrand() == null || vo.getBrand().isBlank()) && asset.getModelId() != null) {
            EamModel model = modelMap.get(asset.getModelId());
            if (model == null && modelMap.isEmpty()) {
                model = modelMapper.selectById(asset.getModelId());
            }
            if (model != null && model.getBrandZh() != null && !model.getBrandZh().isBlank()) {
                vo.setBrand(model.getBrandZh());
            }
        }
        // 品牌仍為空時，從品牌表通過 brandId 回退解析
        if ((vo.getBrand() == null || vo.getBrand().isBlank()) && asset.getBrandId() != null) {
            EamBrand brandEntity = brandMap.get(asset.getBrandId());
            if (brandEntity == null && brandMap.isEmpty()) {
                brandEntity = brandMapper.selectById(asset.getBrandId());
            }
            if (brandEntity != null && brandEntity.getBrandZh() != null && !brandEntity.getBrandZh().isBlank()) {
                vo.setBrand(brandEntity.getBrandZh());
            }
        }
        // 资产名称去掉品牌前缀（品牌已单独展示）
        vo.setAssetName(stripBrandPrefix(vo.getAssetName(), vo.getBrand()));
        // 下單日期從採購訂單獲取
        if (order != null) {
            vo.setOrderDate(order.getOrderDate());
        }
        if (batch != null) {
            vo.setInboundBatchNo(batch.getBatchNo());
            vo.setInboundDate(asset.getPurchaseDate());
            vo.setInboundQty(1);
            vo.setInspector(batch.getOperator());
        }
        if (location != null) {
            vo.setProvince(location.getProvince());
            vo.setCity(location.getCity());
            vo.setDistrict(location.getDistrict());
            vo.setAddress(location.getAddress());
        }
        return vo;
    }

    private EamAssetVO toVO(EamAsset asset, EamInboundBatch batch, EamLocation location) {
        return toVO(asset, batch, location, null);
    }

    private EamAssetVO toVO(EamAsset asset, EamInboundBatch batch) {
        return toVO(asset, batch, null, null);
    }

    private LambdaQueryWrapper<EamAsset> queryWrapper(EamAssetQuery q) {
        LambdaQueryWrapper<EamAsset> w = new LambdaQueryWrapper<>();
        if (hasText(q.getKeyword())) w.and(x -> x.like(EamAsset::getAssetNo, q.getKeyword().trim())
                .or().like(EamAsset::getAssetName, q.getKeyword().trim()).or().like(EamAsset::getUserName, q.getKeyword().trim()));
        w.like(hasText(q.getAssetNo()), EamAsset::getAssetNo, q.getAssetNo())
                .like(hasText(q.getAssetName()), EamAsset::getAssetName, q.getAssetName())
                .eq(hasText(q.getAssetType()), EamAsset::getAssetType, q.getAssetType())
                .eq(hasText(q.getBrand()), EamAsset::getBrand, q.getBrand())
                .eq(hasText(q.getStatus()) && !"all".equals(q.getStatus()), EamAsset::getStatus, q.getStatus())
                .eq(hasText(q.getCompany()), EamAsset::getCompany, q.getCompany())
                .eq(hasText(q.getDepartment()), EamAsset::getDepartment, q.getDepartment())
                .like(hasText(q.getUserName()), EamAsset::getUserName, q.getUserName())
                .eq(q.getCurrentHolderId() != null, EamAsset::getCurrentHolderId, q.getCurrentHolderId())
                .eq(hasText(q.getSource()), EamAsset::getSource, q.getSource())
                .eq(q.getOrderId() != null, EamAsset::getOrderId, q.getOrderId())
                .eq(q.getBatchId() != null, EamAsset::getBatchId, q.getBatchId())
                .like(hasText(q.getUpdatedBy()), EamAsset::getUpdatedBy, q.getUpdatedBy());
        w.eq(q.getBrandId() != null, EamAsset::getBrandId, q.getBrandId());
        w.eq(q.getCompanyBrand() != null, EamAsset::getCompanyBrand, q.getCompanyBrand());
        if (q.getCategoryId() != null) w.in(EamAsset::getCategoryId, transferLookup.categoryIds(q.getCategoryId()));
        if (q.getDepartmentId() != null) {
            List<String> names = transferLookup.departmentNames(q.getDepartmentId());
            if (names.isEmpty()) w.apply("1=0");
            else w.in(EamAsset::getDepartment, names);
        }
        if (hasText(q.getHoldType())) {
            if (!Set.of("owned", "borrowed").contains(q.getHoldType())) throw new BusinessException("無效的持有方式");
            w.eq(EamAsset::getHoldType, q.getHoldType());
        }
        if (hasText(q.getPurchaseDateStart())) w.ge(EamAsset::getPurchaseDate, date(q.getPurchaseDateStart()));
        if (hasText(q.getPurchaseDateEnd())) w.lt(EamAsset::getPurchaseDate, date(q.getPurchaseDateEnd()).plusDays(1).toString());
        if (hasText(q.getScrapDateStart())) w.ge(EamAsset::getScrapTime, date(q.getScrapDateStart()));
        if (hasText(q.getScrapDateEnd())) w.lt(EamAsset::getScrapTime, date(q.getScrapDateEnd()).plusDays(1).toString());
        if (hasText(q.getUpdatedAtStart())) w.ge(EamAsset::getUpdatedAt, date(q.getUpdatedAtStart()).atStartOfDay());
        if (hasText(q.getUpdatedAtEnd())) w.lt(EamAsset::getUpdatedAt, date(q.getUpdatedAtEnd()).plusDays(1).atStartOfDay());
        return w;
    }

    private boolean hasText(String text) { return text != null && !text.isBlank(); }
    private void validateDate(String value) { if (hasText(value)) date(value); }
    private LocalDate date(String value) {
        try { return LocalDate.parse(value); }
        catch (RuntimeException e) { throw new BusinessException("日期格式應為 yyyy-MM-dd"); }
    }

    /* ==================== 資產編號生成（新規則） ==================== */

    /**
     * 生成資產編號: {品牌編碼}-{倉庫編碼}-{分類碼}-{4位分類內序號}
     * 示例: TB-ZH-0101-0001（閃蜂-珠海倉庫-手機分類-第1台）
     */
    @Override
    public String generateAssetNo(Integer companyBrand, Long locationId, String categoryCode) {
        // 优先从 sys_company_brand 表获取品牌编码，失败时回退到静态映射
        String brandCode = companyBrandService.getCodeById(companyBrand != null ? companyBrand.longValue() : null);
        if ("XX".equals(brandCode) && companyBrand != null) {
            log.warn("公司品牌缓存未命中(id={}), 回退到静态映射", companyBrand);
            brandCode = BizSeqService.companyBrandCode(companyBrand);
        }
        String warehouseCode = resolveWarehouseCode(locationId);
        String catCode = (categoryCode != null && !categoryCode.isBlank()) ? categoryCode : "00";
        String prefix = brandCode + "-" + warehouseCode + "-" + catCode + "-";
        int maxSeq = findMaxAssetSeq(prefix);
        return prefix + String.format("%04d", maxSeq + 1);
    }

    /** 向上遍歷 location 樹找到頂層倉庫（parentId=0）的 code */
    private String resolveWarehouseCode(Long locationId) {
        if (locationId == null) return "00";
        EamLocation loc = locationMapper.selectById(locationId);
        while (loc != null && loc.getParentId() != null && loc.getParentId() != 0) {
            loc = locationMapper.selectById(loc.getParentId());
        }
        return (loc != null && loc.getCode() != null && !loc.getCode().isBlank()) ? loc.getCode() : "00";
    }

    /** 按前綴查 biz_eam_asset 表內最大序號（排除軟刪除） */
    private int findMaxAssetSeq(String prefix) {
        String likePattern = prefix + "%";
        int offset = prefix.length();
        Integer max = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(asset_no, ?) AS UNSIGNED)), 0) "
                        + "FROM biz_eam_asset WHERE asset_no LIKE ? AND deleted = 0",
                Integer.class, offset + 1, likePattern);
        return max == null ? 0 : max;
    }

    /**
     * 剥离资产名称中的品牌前缀（品牌已单独展示，避免重复）。
     * 例："华为 华为003" → "华为003"
     */
    public static String stripBrandPrefix(String assetName, String brand) {
        if (assetName == null) return null;
        if (brand == null || brand.isEmpty()) return assetName;
        if (assetName.startsWith(brand)) {
            return assetName.substring(brand.length()).trim();
        }
        return assetName;
    }
}
