package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EamBrand;
import com.mftb.admin.entity.EamCategory;
import com.mftb.admin.entity.EamLocation;
import com.mftb.admin.entity.EamModel;
import com.mftb.admin.mapper.EamBrandMapper;
import com.mftb.admin.mapper.EamCategoryMapper;
import com.mftb.admin.mapper.EamLocationMapper;
import com.mftb.admin.mapper.EamModelMapper;
import com.mftb.admin.service.EamBasicDataService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamBasicDataServiceImpl implements EamBasicDataService {

    private final EamCategoryMapper categoryMapper;
    private final EamBrandMapper brandMapper;
    private final EamModelMapper modelMapper;
    private final EamLocationMapper locationMapper;
    private final OperatorResolver operatorResolver;

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /* ==================== 資產分類 ==================== */

    @Override
    public List<Map<String, Object>> listCategories(String keyword, String name, String code,
                                                     String updatedBy, String updatedAtStart, String updatedAtEnd) {
        LambdaQueryWrapper<EamCategory> wrapper = new LambdaQueryWrapper<>();
        if (keyword != null && !keyword.isBlank()) {
            wrapper.and(w -> w.like(EamCategory::getCode, keyword.trim())
                    .or().like(EamCategory::getName, keyword.trim()));
        }
        if (name != null && !name.isBlank()) wrapper.like(EamCategory::getName, name.trim());
        if (code != null && !code.isBlank()) wrapper.like(EamCategory::getCode, code.trim());
        if (updatedBy != null && !updatedBy.isBlank()) wrapper.like(EamCategory::getUpdatedBy, updatedBy.trim());
        if (updatedAtStart != null && !updatedAtStart.isBlank()) wrapper.ge(EamCategory::getUpdatedAt, updatedAtStart);
        if (updatedAtEnd != null && !updatedAtEnd.isBlank()) wrapper.lt(EamCategory::getUpdatedAt, updatedAtEnd + " 23:59:59");
        wrapper.orderByAsc(EamCategory::getParentId).orderByAsc(EamCategory::getSort);

        return categoryMapper.selectList(wrapper).stream()
                .map(this::categoryToMap)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public long createCategory(Map<String, Object> data) {
        String code = str(data, "code");
        if (code == null || code.isBlank()) throw new BusinessException("分類編碼不能為空");

        // 唯一性校驗
        Long count = categoryMapper.selectCount(
                new LambdaQueryWrapper<EamCategory>().eq(EamCategory::getCode, code));
        if (count > 0) throw new BusinessException("分類編碼已存在");

        EamCategory cat = new EamCategory();
        cat.setCode(code);
        cat.setName(str(data, "name"));
        cat.setParentId(longVal(data, "parentId", 0L));
        cat.setStatus(strOrDefault(data, "status", "enabled"));
        cat.setParamTemplate(str(data, "paramTemplate"));
        cat.setSort(intVal(data, "sort", 0));
        cat.setRemark(strOrDefault(data, "remark", ""));
        cat.setUpdatedBy(operatorResolver.currentOperatorName());
        cat.setCreatedAt(LocalDateTime.now());
        cat.setUpdatedAt(LocalDateTime.now());
        cat.setDeleted(0);
        categoryMapper.insert(cat);
        return cat.getId();
    }

    @Override
    @Transactional
    public void updateCategory(long id, Map<String, Object> data) {
        EamCategory cat = categoryMapper.selectById(id);
        if (cat == null) throw new BusinessException("分類不存在");

        // 編碼唯一性校驗
        String newCode = str(data, "code");
        if (newCode != null && !newCode.isBlank() && !newCode.equals(cat.getCode())) {
            Long count = categoryMapper.selectCount(
                    new LambdaQueryWrapper<EamCategory>().eq(EamCategory::getCode, newCode));
            if (count > 0) throw new BusinessException("分類編碼已存在");
            cat.setCode(newCode);
        }
        if (data.containsKey("name")) cat.setName(str(data, "name"));
        if (data.containsKey("parentId")) cat.setParentId(longVal(data, "parentId", cat.getParentId()));
        if (data.containsKey("status")) cat.setStatus(str(data, "status"));
        if (data.containsKey("paramTemplate")) cat.setParamTemplate(str(data, "paramTemplate"));
        if (data.containsKey("sort")) cat.setSort(intVal(data, "sort", cat.getSort()));
        if (data.containsKey("remark")) cat.setRemark(strOrDefault(data, "remark", cat.getRemark()));
        cat.setUpdatedBy(operatorResolver.currentOperatorName());
        cat.setUpdatedAt(LocalDateTime.now());
        categoryMapper.updateById(cat);
    }

    @Override
    @Transactional
    public void deleteCategory(long id) {
        EamCategory cat = categoryMapper.selectById(id);
        if (cat == null) throw new BusinessException("分類不存在");

        // 檢查下級分類
        Long childCount = categoryMapper.selectCount(
                new LambdaQueryWrapper<EamCategory>().eq(EamCategory::getParentId, id));
        if (childCount > 0) throw new BusinessException("請先刪除下級分類");

        // 檢查是否有關聯型號
        Long modelCount = modelMapper.selectCount(
                new LambdaQueryWrapper<EamModel>().eq(EamModel::getCategoryCode, cat.getCode()));
        if (modelCount > 0) throw new BusinessException("該分類下已存在型號，無法刪除");

        categoryMapper.deleteById(id);
    }

    @Override
    @Transactional
    public void toggleCategoryStatus(long id) {
        EamCategory cat = categoryMapper.selectById(id);
        if (cat == null) throw new BusinessException("分類不存在");
        cat.setStatus("enabled".equals(cat.getStatus()) ? "disabled" : "enabled");
        cat.setUpdatedBy(operatorResolver.currentOperatorName());
        cat.setUpdatedAt(LocalDateTime.now());
        categoryMapper.updateById(cat);
    }

    /* ==================== 品牌庫 ==================== */

    @Override
    public List<Map<String, Object>> listBrands(String categoryCode, String brandZh,
                                                 String updatedBy, String updatedAtStart, String updatedAtEnd) {
        LambdaQueryWrapper<EamBrand> wrapper = new LambdaQueryWrapper<>();
        if (categoryCode != null && !categoryCode.isBlank()) wrapper.eq(EamBrand::getCategoryCode, categoryCode);
        if (brandZh != null && !brandZh.isBlank()) {
            wrapper.and(w -> w.like(EamBrand::getBrandZh, brandZh.trim())
                    .or().like(EamBrand::getBrandEn, brandZh.trim().toLowerCase()));
        }
        if (updatedBy != null && !updatedBy.isBlank()) wrapper.like(EamBrand::getUpdatedBy, updatedBy.trim());
        if (updatedAtStart != null && !updatedAtStart.isBlank()) wrapper.ge(EamBrand::getUpdatedAt, updatedAtStart);
        if (updatedAtEnd != null && !updatedAtEnd.isBlank()) wrapper.lt(EamBrand::getUpdatedAt, updatedAtEnd + " 23:59:59");
        wrapper.orderByDesc(EamBrand::getCreatedAt);

        return brandMapper.selectList(wrapper).stream()
                .map(this::brandToMap)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public long createBrand(Map<String, Object> data) {
        EamBrand brand = new EamBrand();
        brand.setCategoryCode(str(data, "categoryCode"));
        brand.setBrandZh(str(data, "brandZh"));
        brand.setBrandEn(strOrDefault(data, "brandEn", ""));
        brand.setBrandLogo(strOrDefault(data, "brandLogo", ""));
        brand.setUpdatedBy(operatorResolver.currentOperatorName());
        brand.setCreatedAt(LocalDateTime.now());
        brand.setUpdatedAt(LocalDateTime.now());
        brand.setDeleted(0);
        brandMapper.insert(brand);
        return brand.getId();
    }

    @Override
    @Transactional
    public void updateBrand(long id, Map<String, Object> data) {
        EamBrand brand = brandMapper.selectById(id);
        if (brand == null) throw new BusinessException("品牌不存在");
        if (data.containsKey("categoryCode")) brand.setCategoryCode(str(data, "categoryCode"));
        if (data.containsKey("brandZh")) brand.setBrandZh(str(data, "brandZh"));
        if (data.containsKey("brandEn")) brand.setBrandEn(str(data, "brandEn"));
        if (data.containsKey("brandLogo")) brand.setBrandLogo(str(data, "brandLogo"));
        brand.setUpdatedBy(operatorResolver.currentOperatorName());
        brand.setUpdatedAt(LocalDateTime.now());
        brandMapper.updateById(brand);
    }

    @Override
    @Transactional
    public void deleteBrand(long id) {
        EamBrand brand = brandMapper.selectById(id);
        if (brand == null) throw new BusinessException("品牌不存在");
        brandMapper.deleteById(id);
    }

    /* ==================== 產品型號庫 ==================== */

    @Override
    public PageResult<Map<String, Object>> pageModels(int page, int size, String categoryCode, Long brandId,
                                                       String brandZh, String name,
                                                       String updatedBy, String updatedAtStart, String updatedAtEnd) {
        LambdaQueryWrapper<EamModel> wrapper = new LambdaQueryWrapper<>();
        if (categoryCode != null && !categoryCode.isBlank()) {
            wrapper.and(w -> w.eq(EamModel::getCategoryCode, categoryCode)
                    .or().likeRight(EamModel::getCategoryCode, categoryCode));
        }
        if (brandId != null) wrapper.eq(EamModel::getBrandId, brandId);
        if (brandZh != null && !brandZh.isBlank()) {
            wrapper.and(w -> w.like(EamModel::getBrandZh, brandZh.trim())
                    .or().like(EamModel::getBrandEn, brandZh.trim().toLowerCase()));
        }
        if (name != null && !name.isBlank()) wrapper.like(EamModel::getName, name.trim());
        if (updatedBy != null && !updatedBy.isBlank()) wrapper.like(EamModel::getUpdatedBy, updatedBy.trim());
        if (updatedAtStart != null && !updatedAtStart.isBlank()) wrapper.ge(EamModel::getUpdatedAt, updatedAtStart);
        if (updatedAtEnd != null && !updatedAtEnd.isBlank()) wrapper.lt(EamModel::getUpdatedAt, updatedAtEnd + " 23:59:59");
        wrapper.orderByDesc(EamModel::getCreatedAt);

        Page<EamModel> pageObj = new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size));
        Page<EamModel> result = modelMapper.selectPage(pageObj, wrapper);

        List<Map<String, Object>> records = result.getRecords().stream()
                .map(this::modelToMap)
                .collect(Collectors.toList());
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    public Map<String, Object> getModelDetail(long id) {
        EamModel model = modelMapper.selectById(id);
        if (model == null) throw new BusinessException("型號不存在");
        return modelToMap(model);
    }

    @Override
    @Transactional
    public long createModel(Map<String, Object> data) {
        EamModel model = new EamModel();
        model.setCategoryCode(str(data, "categoryCode"));
        model.setBrandId(longVal(data, "brandId", 0L));
        model.setBrandZh(strOrDefault(data, "brandZh", ""));
        model.setBrandEn(strOrDefault(data, "brandEn", ""));
        model.setBrandLogo(strOrDefault(data, "brandLogo", ""));
        model.setModelNo(strOrDefault(data, "modelNo", ""));
        model.setName(str(data, "name"));
        model.setUnit(strOrDefault(data, "unit", "台"));
        model.setRefPrice(bigDecimalVal(data, "refPrice", BigDecimal.ZERO));
        model.setUpdatedBy(operatorResolver.currentOperatorName());
        model.setCreatedAt(LocalDateTime.now());
        model.setUpdatedAt(LocalDateTime.now());
        model.setDeleted(0);
        modelMapper.insert(model);
        return model.getId();
    }

    @Override
    @Transactional
    public void updateModel(long id, Map<String, Object> data) {
        EamModel model = modelMapper.selectById(id);
        if (model == null) throw new BusinessException("型號不存在");
        if (data.containsKey("categoryCode")) model.setCategoryCode(str(data, "categoryCode"));
        if (data.containsKey("brandId")) model.setBrandId(longVal(data, "brandId", model.getBrandId()));
        if (data.containsKey("brandZh")) model.setBrandZh(str(data, "brandZh"));
        if (data.containsKey("brandEn")) model.setBrandEn(str(data, "brandEn"));
        if (data.containsKey("brandLogo")) model.setBrandLogo(str(data, "brandLogo"));
        if (data.containsKey("modelNo")) model.setModelNo(str(data, "modelNo"));
        if (data.containsKey("name")) model.setName(str(data, "name"));
        if (data.containsKey("unit")) model.setUnit(str(data, "unit"));
        if (data.containsKey("refPrice")) model.setRefPrice(bigDecimalVal(data, "refPrice", model.getRefPrice()));
        model.setUpdatedBy(operatorResolver.currentOperatorName());
        model.setUpdatedAt(LocalDateTime.now());
        modelMapper.updateById(model);
    }

    @Override
    @Transactional
    public void deleteModel(long id) {
        EamModel model = modelMapper.selectById(id);
        if (model == null) throw new BusinessException("型號不存在");
        modelMapper.deleteById(id);
    }

    /* ==================== 倉庫 / 存放位置 ==================== */

    @Override
    public List<Map<String, Object>> listLocations(String keyword, String name, String code, String type, String updatedBy) {
        LambdaQueryWrapper<EamLocation> wrapper = new LambdaQueryWrapper<>();
        if (keyword != null && !keyword.isBlank()) {
            wrapper.and(w -> w.like(EamLocation::getCode, keyword.trim())
                    .or().like(EamLocation::getName, keyword.trim()));
        }
        if (name != null && !name.isBlank()) wrapper.like(EamLocation::getName, name.trim());
        if (code != null && !code.isBlank()) wrapper.like(EamLocation::getCode, code.trim());
        if (type != null && !type.isBlank()) wrapper.eq(EamLocation::getType, type);
        if (updatedBy != null && !updatedBy.isBlank()) wrapper.like(EamLocation::getUpdatedBy, updatedBy.trim());
        wrapper.orderByAsc(EamLocation::getParentId).orderByAsc(EamLocation::getSort);

        return locationMapper.selectList(wrapper).stream()
                .map(this::locationToMap)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public long createLocation(Map<String, Object> data) {
        String code = str(data, "code");

        // 自動生成編碼邏輯
        if ("__auto__".equals(code) || code == null || code.isBlank()) {
            String type = strOrDefault(data, "type", "warehouse");
            String prefix;
            switch (type) {
                case "floor": prefix = "CKDZ"; break;
                case "room": prefix = "CKDZXQ"; break;
                default: prefix = "CK"; break;
            }
            String today = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
            String p = prefix + today;
            Long sameDayCount = locationMapper.selectCount(
                    new LambdaQueryWrapper<EamLocation>().likeRight(EamLocation::getCode, p));
            code = p + String.format("%03d", sameDayCount + 1);
        }

        // 唯一性校驗
        Long count = locationMapper.selectCount(
                new LambdaQueryWrapper<EamLocation>().eq(EamLocation::getCode, code));
        if (count > 0) throw new BusinessException("位置編碼已存在");

        EamLocation loc = new EamLocation();
        loc.setCode(code);
        loc.setName(str(data, "name"));
        loc.setParentId(longVal(data, "parentId", 0L));
        loc.setType(strOrDefault(data, "type", "warehouse"));
        loc.setSort(intVal(data, "sort", 0));
        loc.setAddress(strOrDefault(data, "address", ""));
        loc.setRemark(strOrDefault(data, "remark", ""));
        loc.setUpdatedBy(operatorResolver.currentOperatorName());
        loc.setCreatedAt(LocalDateTime.now());
        loc.setUpdatedAt(LocalDateTime.now());
        loc.setDeleted(0);
        locationMapper.insert(loc);
        return loc.getId();
    }

    @Override
    @Transactional
    public void updateLocation(long id, Map<String, Object> data) {
        EamLocation loc = locationMapper.selectById(id);
        if (loc == null) throw new BusinessException("位置不存在");

        String newCode = str(data, "code");
        if (newCode != null && !newCode.isBlank() && !"__auto__".equals(newCode) && !newCode.equals(loc.getCode())) {
            Long count = locationMapper.selectCount(
                    new LambdaQueryWrapper<EamLocation>().eq(EamLocation::getCode, newCode));
            if (count > 0) throw new BusinessException("位置編碼已存在");
            loc.setCode(newCode);
        }
        if (data.containsKey("name")) loc.setName(str(data, "name"));
        if (data.containsKey("parentId")) loc.setParentId(longVal(data, "parentId", loc.getParentId()));
        if (data.containsKey("type")) loc.setType(str(data, "type"));
        if (data.containsKey("sort")) loc.setSort(intVal(data, "sort", loc.getSort()));
        if (data.containsKey("address")) loc.setAddress(str(data, "address"));
        if (data.containsKey("remark")) loc.setRemark(strOrDefault(data, "remark", loc.getRemark()));
        loc.setUpdatedBy(operatorResolver.currentOperatorName());
        loc.setUpdatedAt(LocalDateTime.now());
        locationMapper.updateById(loc);
    }

    @Override
    @Transactional
    public void deleteLocation(long id) {
        EamLocation loc = locationMapper.selectById(id);
        if (loc == null) throw new BusinessException("位置不存在");

        // 檢查下級
        Long childCount = locationMapper.selectCount(
                new LambdaQueryWrapper<EamLocation>().eq(EamLocation::getParentId, id));
        if (childCount > 0) throw new BusinessException("請先刪除下級位置");

        locationMapper.deleteById(id);
    }

    /* ==================== 實體 → Map 轉換 ==================== */

    private Map<String, Object> categoryToMap(EamCategory cat) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", cat.getId());
        map.put("code", cat.getCode());
        map.put("name", cat.getName());
        map.put("parentId", cat.getParentId());
        map.put("status", cat.getStatus());
        map.put("paramTemplate", cat.getParamTemplate());
        map.put("sort", cat.getSort());
        map.put("remark", cat.getRemark());
        map.put("updatedBy", cat.getUpdatedBy());
        map.put("updatedAt", cat.getUpdatedAt() != null ? cat.getUpdatedAt().format(DT_FMT) : "");
        map.put("createdAt", cat.getCreatedAt() != null ? cat.getCreatedAt().format(DT_FMT) : "");
        return map;
    }

    private Map<String, Object> brandToMap(EamBrand brand) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", brand.getId());
        map.put("categoryCode", brand.getCategoryCode());
        map.put("brandZh", brand.getBrandZh());
        map.put("brandEn", brand.getBrandEn());
        map.put("brandLogo", brand.getBrandLogo());
        map.put("createdAt", brand.getCreatedAt() != null ? brand.getCreatedAt().format(DT_FMT) : "");
        map.put("updatedBy", brand.getUpdatedBy());
        map.put("updatedAt", brand.getUpdatedAt() != null ? brand.getUpdatedAt().format(DT_FMT) : "");
        return map;
    }

    private Map<String, Object> modelToMap(EamModel model) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", model.getId());
        map.put("categoryCode", model.getCategoryCode());
        map.put("brandId", model.getBrandId());
        map.put("brandZh", model.getBrandZh());
        map.put("brandEn", model.getBrandEn());
        map.put("brandLogo", model.getBrandLogo());
        map.put("modelNo", model.getModelNo());
        map.put("name", model.getName());
        map.put("unit", model.getUnit());
        map.put("refPrice", model.getRefPrice());
        map.put("createdAt", model.getCreatedAt() != null ? model.getCreatedAt().format(DT_FMT) : "");
        map.put("updatedBy", model.getUpdatedBy());
        map.put("updatedAt", model.getUpdatedAt() != null ? model.getUpdatedAt().format(DT_FMT) : "");
        return map;
    }

    private Map<String, Object> locationToMap(EamLocation loc) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", loc.getId());
        map.put("code", loc.getCode());
        map.put("name", loc.getName());
        map.put("parentId", loc.getParentId());
        map.put("type", loc.getType());
        map.put("sort", loc.getSort());
        map.put("address", loc.getAddress());
        map.put("remark", loc.getRemark());
        map.put("updatedBy", loc.getUpdatedBy());
        map.put("updatedAt", loc.getUpdatedAt() != null ? loc.getUpdatedAt().format(DT_FMT) : "");
        map.put("createdAt", loc.getCreatedAt() != null ? loc.getCreatedAt().format(DT_FMT) : "");
        return map;
    }

    /* ==================== 工具方法 ==================== */

    private String str(Map<String, Object> data, String key) {
        Object v = data.get(key);
        return v != null ? v.toString() : null;
    }

    private String strOrDefault(Map<String, Object> data, String key, String defaultValue) {
        Object v = data.get(key);
        if (v == null) return defaultValue;
        String s = v.toString();
        return s.isBlank() ? defaultValue : s;
    }

    private long longVal(Map<String, Object> data, String key, long defaultValue) {
        Object v = data.get(key);
        if (v == null) return defaultValue;
        if (v instanceof Number) return ((Number) v).longValue();
        try { return Long.parseLong(v.toString()); } catch (Exception e) { return defaultValue; }
    }

    private int intVal(Map<String, Object> data, String key, int defaultValue) {
        Object v = data.get(key);
        if (v == null) return defaultValue;
        if (v instanceof Number) return ((Number) v).intValue();
        try { return Integer.parseInt(v.toString()); } catch (Exception e) { return defaultValue; }
    }

    private BigDecimal bigDecimalVal(Map<String, Object> data, String key, BigDecimal defaultValue) {
        Object v = data.get(key);
        if (v == null) return defaultValue;
        if (v instanceof Number) return BigDecimal.valueOf(((Number) v).doubleValue());
        try { return new BigDecimal(v.toString()); } catch (Exception e) { return defaultValue; }
    }
}
