package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamBrandSaveDTO;
import com.mftb.admin.dto.EamCategoryAccessorySaveDTO;
import com.mftb.admin.dto.EamCategorySaveDTO;
import com.mftb.admin.dto.EamLocationSaveDTO;
import com.mftb.admin.dto.EamModelSaveDTO;
import com.mftb.admin.dto.EamParamTypeSaveDTO;
import com.mftb.admin.dto.EamParamValueSaveDTO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EamBrand;
import com.mftb.admin.entity.EamCategory;
import com.mftb.admin.entity.EamCategoryAccessory;
import com.mftb.admin.entity.EamLocation;
import com.mftb.admin.entity.EamModel;
import com.mftb.admin.entity.EamParamType;
import com.mftb.admin.entity.EamParamValue;
import com.mftb.admin.mapper.EamBrandMapper;
import com.mftb.admin.mapper.EamCategoryAccessoryMapper;
import com.mftb.admin.mapper.EamCategoryMapper;
import com.mftb.admin.mapper.EamLocationMapper;
import com.mftb.admin.mapper.EamModelMapper;
import com.mftb.admin.mapper.EamParamTypeMapper;
import com.mftb.admin.mapper.EamParamValueMapper;
import com.mftb.admin.service.EamBasicDataService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.beans.factory.InitializingBean;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamBasicDataServiceImpl implements EamBasicDataService, InitializingBean {

    private final EamCategoryMapper categoryMapper;
    private final EamBrandMapper brandMapper;
    private final EamModelMapper modelMapper;
    private final EamLocationMapper locationMapper;
    private final EamParamTypeMapper paramTypeMapper;
    private final EamParamValueMapper paramValueMapper;
    private final EamCategoryAccessoryMapper categoryAccessoryMapper;
    private final OperatorResolver operatorResolver;
    private final JdbcTemplate jdbcTemplate;

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Override
    public void afterPropertiesSet() {
        // 幂等建表（参数库）
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS biz_eam_param_type ("
            + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵', "
            + "category_code VARCHAR(64) NOT NULL, code VARCHAR(64) NOT NULL, "
            + "name VARCHAR(100) NOT NULL, unit VARCHAR(32) DEFAULT '', "
            + "value_type VARCHAR(16) NOT NULL DEFAULT 'select', "
            + "status VARCHAR(16) NOT NULL DEFAULT 'enabled', "
            + "sort INT NOT NULL DEFAULT 0, updated_by VARCHAR(64) DEFAULT '', "
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted TINYINT NOT NULL DEFAULT 0, "
            + "UNIQUE KEY uk_category_code (category_code, code), "
            + "KEY idx_category_code (category_code), KEY idx_status (status)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='參數類型'"
        );
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS biz_eam_param_value ("
            + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主鍵', "
            + "param_type_code VARCHAR(64) NOT NULL, category_code VARCHAR(64) NOT NULL, "
            + "value VARCHAR(200) NOT NULL, sort INT NOT NULL DEFAULT 0, "
            + "status VARCHAR(16) NOT NULL DEFAULT 'enabled', "
            + "updated_by VARCHAR(64) DEFAULT '', "
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, deleted TINYINT NOT NULL DEFAULT 0, "
            + "KEY idx_param_type_code (param_type_code), KEY idx_category_code (category_code)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='參數值'"
        );
        log.info("EAM 參數庫表就緒");
    }

    /* ==================== 资产分类 ==================== */

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
    public long createCategory(EamCategorySaveDTO dto) {
        String code = dto.getCode();
        if (code == null || code.isBlank()) throw new BusinessException("分類編碼不能為空");

        // 唯一性校验
        Long count = categoryMapper.selectCount(
                new LambdaQueryWrapper<EamCategory>().eq(EamCategory::getCode, code));
        if (count > 0) throw new BusinessException("分類編碼已存在");

        EamCategory cat = new EamCategory();
        cat.setCode(code);
        cat.setName(dto.getName());
        cat.setParentId(dto.getParentId() == null ? 0L : dto.getParentId());
        cat.setStatus(dto.getStatus() == null ? "enabled" : dto.getStatus());
        cat.setParamTemplate(dto.getParamTemplate());
        cat.setSort(dto.getSort() == null ? 0 : dto.getSort());
        cat.setRemark(Objects.toString(dto.getRemark(), ""));
        cat.setUpdatedBy(operatorResolver.currentOperatorName());
        cat.setCreatedAt(LocalDateTime.now());
        cat.setUpdatedAt(LocalDateTime.now());
        cat.setDeleted(0);
        categoryMapper.insert(cat);
        return cat.getId();
    }

    @Override
    @Transactional
    public void updateCategory(long id, EamCategorySaveDTO dto) {
        EamCategory cat = categoryMapper.selectById(id);
        if (cat == null) throw new BusinessException("分類不存在");

        // 编码唯一性校验
        String newCode = dto.getCode();
        if (newCode != null && !newCode.isBlank() && !newCode.equals(cat.getCode())) {
            Long count = categoryMapper.selectCount(
                    new LambdaQueryWrapper<EamCategory>().eq(EamCategory::getCode, newCode));
            if (count > 0) throw new BusinessException("分類編碼已存在");
            cat.setCode(newCode);
        }
        if (dto.getName() != null) cat.setName(dto.getName());
        if (dto.getParentId() != null) cat.setParentId(dto.getParentId());
        if (dto.getStatus() != null) cat.setStatus(dto.getStatus());
        if (dto.getParamTemplate() != null) cat.setParamTemplate(dto.getParamTemplate());
        if (dto.getSort() != null) cat.setSort(dto.getSort());
        if (dto.getRemark() != null) cat.setRemark(dto.getRemark());
        cat.setUpdatedBy(operatorResolver.currentOperatorName());
        cat.setUpdatedAt(LocalDateTime.now());
        categoryMapper.updateById(cat);
    }

    @Override
    @Transactional
    public void deleteCategory(long id) {
        EamCategory cat = categoryMapper.selectById(id);
        if (cat == null) throw new BusinessException("分類不存在");

        // 检查下级分类
        Long childCount = categoryMapper.selectCount(
                new LambdaQueryWrapper<EamCategory>().eq(EamCategory::getParentId, id));
        if (childCount > 0) throw new BusinessException("請先刪除下級分類");

        // 检查是否有关联型号
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

    /* ==================== 资产品牌库 ==================== */

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
    public long createBrand(EamBrandSaveDTO dto) {
        EamBrand brand = new EamBrand();
        brand.setCategoryCode(dto.getCategoryCode());
        brand.setBrandZh(dto.getBrandZh());
        brand.setBrandEn(Objects.toString(dto.getBrandEn(), ""));
        brand.setBrandLogo(Objects.toString(dto.getBrandLogo(), ""));
        brand.setUpdatedBy(operatorResolver.currentOperatorName());
        brand.setCreatedAt(LocalDateTime.now());
        brand.setUpdatedAt(LocalDateTime.now());
        brand.setDeleted(0);
        brandMapper.insert(brand);
        return brand.getId();
    }

    @Override
    @Transactional
    public void updateBrand(long id, EamBrandSaveDTO dto) {
        EamBrand brand = brandMapper.selectById(id);
        if (brand == null) throw new BusinessException("资产品牌不存在");
        if (dto.getCategoryCode() != null) brand.setCategoryCode(dto.getCategoryCode());
        if (dto.getBrandZh() != null) brand.setBrandZh(dto.getBrandZh());
        if (dto.getBrandEn() != null) brand.setBrandEn(dto.getBrandEn());
        if (dto.getBrandLogo() != null) brand.setBrandLogo(dto.getBrandLogo());
        brand.setUpdatedBy(operatorResolver.currentOperatorName());
        brand.setUpdatedAt(LocalDateTime.now());
        brandMapper.updateById(brand);
    }

    @Override
    @Transactional
    public void deleteBrand(long id) {
        EamBrand brand = brandMapper.selectById(id);
        if (brand == null) throw new BusinessException("资产品牌不存在");
        brandMapper.deleteById(id);
    }

    /* ==================== 产品型号库 ==================== */

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
    public long createModel(EamModelSaveDTO dto) {
        EamModel model = new EamModel();
        model.setCategoryCode(dto.getCategoryCode());
        model.setBrandId(dto.getBrandId() == null ? 0L : dto.getBrandId());
        model.setBrandZh(Objects.toString(dto.getBrandZh(), ""));
        model.setBrandEn(Objects.toString(dto.getBrandEn(), ""));
        model.setBrandLogo(Objects.toString(dto.getBrandLogo(), ""));
        model.setModelNo(Objects.toString(dto.getModelNo(), ""));
        model.setName(dto.getName());
        model.setUnit(dto.getUnit() == null ? "台" : dto.getUnit());
        model.setRefPrice(dto.getRefPrice() == null ? BigDecimal.ZERO : dto.getRefPrice());
        model.setUpdatedBy(operatorResolver.currentOperatorName());
        model.setCreatedAt(LocalDateTime.now());
        model.setUpdatedAt(LocalDateTime.now());
        model.setDeleted(0);
        modelMapper.insert(model);
        return model.getId();
    }

    @Override
    @Transactional
    public void updateModel(long id, EamModelSaveDTO dto) {
        EamModel model = modelMapper.selectById(id);
        if (model == null) throw new BusinessException("型號不存在");
        if (dto.getCategoryCode() != null) model.setCategoryCode(dto.getCategoryCode());
        if (dto.getBrandId() != null) model.setBrandId(dto.getBrandId());
        if (dto.getBrandZh() != null) model.setBrandZh(dto.getBrandZh());
        if (dto.getBrandEn() != null) model.setBrandEn(dto.getBrandEn());
        if (dto.getBrandLogo() != null) model.setBrandLogo(dto.getBrandLogo());
        if (dto.getModelNo() != null) model.setModelNo(dto.getModelNo());
        if (dto.getName() != null) model.setName(dto.getName());
        if (dto.getUnit() != null) model.setUnit(dto.getUnit());
        if (dto.getRefPrice() != null) model.setRefPrice(dto.getRefPrice());
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

    /* ==================== 仓库 / 存放位置 ==================== */

    @Override
    public List<Map<String, Object>> listLocations(String keyword, String name, String code, String province, String city, String district, String updatedBy) {
        LambdaQueryWrapper<EamLocation> wrapper = new LambdaQueryWrapper<>();
        if (keyword != null && !keyword.isBlank()) {
            wrapper.and(w -> w.like(EamLocation::getCode, keyword.trim())
                    .or().like(EamLocation::getName, keyword.trim()));
        }
        if (name != null && !name.isBlank()) wrapper.like(EamLocation::getName, name.trim());
        if (code != null && !code.isBlank()) wrapper.like(EamLocation::getCode, code.trim());
        if (province != null && !province.isBlank()) wrapper.like(EamLocation::getProvince, province.trim());
        if (city != null && !city.isBlank()) wrapper.like(EamLocation::getCity, city.trim());
        if (district != null && !district.isBlank()) wrapper.like(EamLocation::getDistrict, district.trim());
        if (updatedBy != null && !updatedBy.isBlank()) wrapper.like(EamLocation::getUpdatedBy, updatedBy.trim());
        wrapper.orderByAsc(EamLocation::getParentId).orderByAsc(EamLocation::getSort);

        return locationMapper.selectList(wrapper).stream()
                .map(this::locationToMap)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public long createLocation(EamLocationSaveDTO dto) {
        String code = dto.getCode();
        if (code == null || code.isBlank()) throw new BusinessException("位置編碼不能為空");

        // 唯一性校验
        Long count = locationMapper.selectCount(
                new LambdaQueryWrapper<EamLocation>().eq(EamLocation::getCode, code));
        if (count > 0) throw new BusinessException("位置編碼已存在");

        EamLocation loc = new EamLocation();
        loc.setCode(code);
        loc.setName(dto.getName());
        loc.setParentId(dto.getParentId() == null ? 0L : dto.getParentId());
        loc.setSort(dto.getSort() == null ? 0 : dto.getSort());
        loc.setProvince(Objects.toString(dto.getProvince(), ""));
        loc.setCity(Objects.toString(dto.getCity(), ""));
        loc.setDistrict(Objects.toString(dto.getDistrict(), ""));
        loc.setAddress(Objects.toString(dto.getAddress(), ""));
        loc.setRemark(Objects.toString(dto.getRemark(), ""));
        loc.setUpdatedBy(operatorResolver.currentOperatorName());
        loc.setCreatedAt(LocalDateTime.now());
        loc.setUpdatedAt(LocalDateTime.now());
        loc.setDeleted(0);
        locationMapper.insert(loc);
        return loc.getId();
    }

    @Override
    @Transactional
    public void updateLocation(long id, EamLocationSaveDTO dto) {
        EamLocation loc = locationMapper.selectById(id);
        if (loc == null) throw new BusinessException("位置不存在");

        String newCode = dto.getCode();
        if (newCode != null && !newCode.isBlank() && !newCode.equals(loc.getCode())) {
            Long count = locationMapper.selectCount(
                    new LambdaQueryWrapper<EamLocation>().eq(EamLocation::getCode, newCode));
            if (count > 0) throw new BusinessException("位置編碼已存在");
            loc.setCode(newCode);
        }
        if (dto.getName() != null) loc.setName(dto.getName());
        if (dto.getParentId() != null) loc.setParentId(dto.getParentId());
        if (dto.getSort() != null) loc.setSort(dto.getSort());
        if (dto.getProvince() != null) loc.setProvince(dto.getProvince());
        if (dto.getCity() != null) loc.setCity(dto.getCity());
        if (dto.getDistrict() != null) loc.setDistrict(dto.getDistrict());
        if (dto.getAddress() != null) loc.setAddress(dto.getAddress());
        if (dto.getRemark() != null) loc.setRemark(dto.getRemark());
        loc.setUpdatedBy(operatorResolver.currentOperatorName());
        loc.setUpdatedAt(LocalDateTime.now());
        locationMapper.updateById(loc);
    }

    @Override
    @Transactional
    public void deleteLocation(long id) {
        EamLocation loc = locationMapper.selectById(id);
        if (loc == null) throw new BusinessException("位置不存在");

        // 检查下级
        Long childCount = locationMapper.selectCount(
                new LambdaQueryWrapper<EamLocation>().eq(EamLocation::getParentId, id));
        if (childCount > 0) throw new BusinessException("請先刪除下級位置");

        locationMapper.deleteById(id);
    }

    /* ==================== 实体 → Map 转换 ==================== */

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
        map.put("province", loc.getProvince());
        map.put("city", loc.getCity());
        map.put("district", loc.getDistrict());
        map.put("sort", loc.getSort());
        map.put("address", loc.getAddress());
        map.put("remark", loc.getRemark());
        map.put("updatedBy", loc.getUpdatedBy());
        map.put("updatedAt", loc.getUpdatedAt() != null ? loc.getUpdatedAt().format(DT_FMT) : "");
        map.put("createdAt", loc.getCreatedAt() != null ? loc.getCreatedAt().format(DT_FMT) : "");
        return map;
    }

    /* ==================== 参数库 ==================== */

    @Override
    public PageResult<Map<String, Object>> pageParamTypes(int page, int size, String categoryCode, String name, String code, String status) {
        LambdaQueryWrapper<EamParamType> wrapper = new LambdaQueryWrapper<>();
        if (categoryCode != null && !categoryCode.isBlank()) {
            wrapper.and(w -> w.eq(EamParamType::getCategoryCode, categoryCode)
                    .or().likeRight(EamParamType::getCategoryCode, categoryCode));
        }
        if (name != null && !name.isBlank()) wrapper.like(EamParamType::getName, name.trim());
        if (code != null && !code.isBlank()) wrapper.like(EamParamType::getCode, code.trim());
        if (status != null && !status.isBlank()) wrapper.eq(EamParamType::getStatus, status);
        wrapper.orderByAsc(EamParamType::getSort);

        Page<EamParamType> pageObj = new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size));
        Page<EamParamType> result = paramTypeMapper.selectPage(pageObj, wrapper);

        List<Map<String, Object>> records = result.getRecords().stream()
                .map(this::paramTypeToMap)
                .collect(Collectors.toList());
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    @Transactional
    public long createParamType(EamParamTypeSaveDTO dto) {
        String categoryCode = dto.getCategoryCode();
        String code = dto.getCode();
        if (categoryCode == null || categoryCode.isBlank()) throw new BusinessException("分類編碼不能為空");
        if (code == null || code.isBlank()) throw new BusinessException("參數編碼不能為空");

        Long count = paramTypeMapper.selectCount(
                new LambdaQueryWrapper<EamParamType>()
                        .eq(EamParamType::getCategoryCode, categoryCode)
                        .eq(EamParamType::getCode, code));
        if (count > 0) throw new BusinessException("該分類下參數編碼已存在");

        EamParamType pt = new EamParamType();
        pt.setCategoryCode(categoryCode);
        pt.setCode(code);
        pt.setName(dto.getName());
        pt.setUnit(Objects.toString(dto.getUnit(), ""));
        pt.setValueType(dto.getValueType() == null ? "select" : dto.getValueType());
        pt.setStatus(dto.getStatus() == null ? "enabled" : dto.getStatus());
        pt.setSort(dto.getSort() == null ? 0 : dto.getSort());
        pt.setUpdatedBy(operatorResolver.currentOperatorName());
        pt.setCreatedAt(LocalDateTime.now());
        pt.setUpdatedAt(LocalDateTime.now());
        pt.setDeleted(0);
        paramTypeMapper.insert(pt);
        return pt.getId();
    }

    @Override
    @Transactional
    public void updateParamType(long id, EamParamTypeSaveDTO dto) {
        EamParamType pt = paramTypeMapper.selectById(id);
        if (pt == null) throw new BusinessException("參數類型不存在");
        if (dto.getName() != null) pt.setName(dto.getName());
        if (dto.getUnit() != null) pt.setUnit(dto.getUnit());
        if (dto.getValueType() != null) pt.setValueType(dto.getValueType());
        if (dto.getStatus() != null) pt.setStatus(dto.getStatus());
        if (dto.getSort() != null) pt.setSort(dto.getSort());
        pt.setUpdatedBy(operatorResolver.currentOperatorName());
        pt.setUpdatedAt(LocalDateTime.now());
        paramTypeMapper.updateById(pt);
    }

    @Override
    @Transactional
    public void deleteParamType(long id) {
        EamParamType pt = paramTypeMapper.selectById(id);
        if (pt == null) throw new BusinessException("參數類型不存在");
        // 同时删除该参数类型下的所有参数值
        paramValueMapper.delete(new LambdaQueryWrapper<EamParamValue>()
                .eq(EamParamValue::getParamTypeCode, pt.getCode())
                .eq(EamParamValue::getCategoryCode, pt.getCategoryCode()));
        paramTypeMapper.deleteById(id);
    }

    @Override
    public List<Map<String, Object>> listParamValuesByType(String paramTypeCode) {
        LambdaQueryWrapper<EamParamValue> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EamParamValue::getParamTypeCode, paramTypeCode);
        wrapper.eq(EamParamValue::getStatus, "enabled");
        wrapper.orderByAsc(EamParamValue::getSort);
        return paramValueMapper.selectList(wrapper).stream()
                .map(this::paramValueToMap)
                .collect(Collectors.toList());
    }

    @Override
    public PageResult<Map<String, Object>> pageParamValues(int page, int size, String paramTypeCode, String categoryCode) {
        LambdaQueryWrapper<EamParamValue> wrapper = new LambdaQueryWrapper<>();
        if (paramTypeCode != null && !paramTypeCode.isBlank()) wrapper.eq(EamParamValue::getParamTypeCode, paramTypeCode);
        if (categoryCode != null && !categoryCode.isBlank()) wrapper.eq(EamParamValue::getCategoryCode, categoryCode);
        wrapper.orderByAsc(EamParamValue::getSort);

        Page<EamParamValue> pageObj = new Page<>(PageResult.normalizePage(page), PageResult.normalizeSize(size));
        Page<EamParamValue> result = paramValueMapper.selectPage(pageObj, wrapper);

        List<Map<String, Object>> records = result.getRecords().stream()
                .map(this::paramValueToMap)
                .collect(Collectors.toList());
        return new PageResult<>(records, result.getTotal());
    }

    @Override
    @Transactional
    public long createParamValue(EamParamValueSaveDTO dto) {
        EamParamValue pv = new EamParamValue();
        pv.setParamTypeCode(dto.getParamTypeCode());
        pv.setCategoryCode(dto.getCategoryCode());
        pv.setValue(dto.getValue());
        pv.setSort(dto.getSort() == null ? 0 : dto.getSort());
        pv.setStatus(dto.getStatus() == null ? "enabled" : dto.getStatus());
        pv.setUpdatedBy(operatorResolver.currentOperatorName());
        pv.setCreatedAt(LocalDateTime.now());
        pv.setUpdatedAt(LocalDateTime.now());
        pv.setDeleted(0);
        paramValueMapper.insert(pv);
        return pv.getId();
    }

    @Override
    @Transactional
    public void updateParamValue(long id, EamParamValueSaveDTO dto) {
        EamParamValue pv = paramValueMapper.selectById(id);
        if (pv == null) throw new BusinessException("參數值不存在");
        if (dto.getValue() != null) pv.setValue(dto.getValue());
        if (dto.getSort() != null) pv.setSort(dto.getSort());
        if (dto.getStatus() != null) pv.setStatus(dto.getStatus());
        pv.setUpdatedBy(operatorResolver.currentOperatorName());
        pv.setUpdatedAt(LocalDateTime.now());
        paramValueMapper.updateById(pv);
    }

    @Override
    @Transactional
    public void deleteParamValue(long id) {
        EamParamValue pv = paramValueMapper.selectById(id);
        if (pv == null) throw new BusinessException("參數值不存在");
        paramValueMapper.deleteById(id);
    }

    /* ==================== 分类配件配置 ==================== */

    @Override
    public List<Map<String, Object>> listCategoryAccessories(String categoryCode, boolean onlyEnabled) {
        LambdaQueryWrapper<EamCategoryAccessory> wrapper = new LambdaQueryWrapper<>();
        if (categoryCode != null && !categoryCode.isBlank()) {
            wrapper.eq(EamCategoryAccessory::getCategoryCode, categoryCode);
        }
        if (onlyEnabled) {
            wrapper.eq(EamCategoryAccessory::getStatus, 1);
        }
        wrapper.orderByAsc(EamCategoryAccessory::getSort)
                .orderByAsc(EamCategoryAccessory::getId);
        return categoryAccessoryMapper.selectList(wrapper).stream()
                .map(this::categoryAccessoryToMap)
                .collect(Collectors.toList());
    }

    @Override
    public Long createCategoryAccessory(String categoryCode, EamCategoryAccessorySaveDTO dto) {
        if (categoryCode == null || categoryCode.isBlank()) {
            throw new BusinessException("分類編碼不能為空");
        }
        EamCategoryAccessorySaveDTO body = dto == null ? new EamCategoryAccessorySaveDTO() : dto;
        String name = body.getName() == null ? "" : body.getName().trim();
        if (name.isEmpty()) {
            throw new BusinessException("配件名稱不能為空");
        }
        if (accessoryNameExists(categoryCode, name, null)) {
            throw new BusinessException("該分類下已存在同名配件：" + name);
        }
        EamCategoryAccessory acc = new EamCategoryAccessory();
        acc.setCategoryCode(categoryCode);
        acc.setName(name);
        acc.setDefaultQty(body.getDefaultQty() == null || body.getDefaultQty() < 1 ? 1 : body.getDefaultQty());
        acc.setStatus(1);
        acc.setSort(Math.toIntExact(categoryAccessoryMapper.selectCount(
                new LambdaQueryWrapper<EamCategoryAccessory>().eq(EamCategoryAccessory::getCategoryCode, categoryCode))));
        LocalDateTime now = LocalDateTime.now();
        acc.setCreatedAt(now);
        acc.setUpdatedAt(now);
        acc.setUpdatedBy(operatorResolver.currentOperatorName());
        acc.setDeleted(0);
        categoryAccessoryMapper.insert(acc);
        return acc.getId();
    }
    
    @Override
    public void updateCategoryAccessory(long id, EamCategoryAccessorySaveDTO dto) {
        EamCategoryAccessory acc = categoryAccessoryMapper.selectById(id);
        if (acc == null) {
            throw new BusinessException("配件不存在或已被刪除");
        }
        EamCategoryAccessorySaveDTO body = dto == null ? new EamCategoryAccessorySaveDTO() : dto;
        String name = body.getName() == null ? "" : body.getName().trim();
        if (name.isEmpty()) {
            throw new BusinessException("配件名稱不能為空");
        }
        if (accessoryNameExists(acc.getCategoryCode(), name, id)) {
            throw new BusinessException("該分類下已存在同名配件：" + name);
        }
        acc.setName(name);
        if (body.getDefaultQty() != null) {
            acc.setDefaultQty(Math.max(body.getDefaultQty(), 1));
        }
        acc.setUpdatedBy(operatorResolver.currentOperatorName());
        acc.setUpdatedAt(LocalDateTime.now());
        categoryAccessoryMapper.updateById(acc);
    }
    
    @Override
    public void updateCategoryAccessoryStatus(long id, Integer status) {
        EamCategoryAccessory acc = categoryAccessoryMapper.selectById(id);
        if (acc == null) {
            throw new BusinessException("配件不存在或已被刪除");
        }
        acc.setStatus(status != null && status == 0 ? 0 : 1);
        acc.setUpdatedBy(operatorResolver.currentOperatorName());
        acc.setUpdatedAt(LocalDateTime.now());
        categoryAccessoryMapper.updateById(acc);
    }
    
    @Override
    public void deleteCategoryAccessory(long id) {
        EamCategoryAccessory acc = categoryAccessoryMapper.selectById(id);
        if (acc == null) {
            throw new BusinessException("配件不存在或已被刪除");
        }
        // @TableLogic 下 deleteById 为逻辑删除
        categoryAccessoryMapper.deleteById(id);
    }
    
    /** 同分类下配件名稱是否已存在（excludeId 用于修改时排除自身） */
    private boolean accessoryNameExists(String categoryCode, String name, Long excludeId) {
        LambdaQueryWrapper<EamCategoryAccessory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EamCategoryAccessory::getCategoryCode, categoryCode)
                .eq(EamCategoryAccessory::getName, name);
        if (excludeId != null) {
            wrapper.ne(EamCategoryAccessory::getId, excludeId);
        }
        return categoryAccessoryMapper.selectCount(wrapper) > 0;
    }

    private Map<String, Object> categoryAccessoryToMap(EamCategoryAccessory acc) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", acc.getId());
        map.put("categoryCode", acc.getCategoryCode());
        map.put("name", acc.getName());
        map.put("defaultQty", acc.getDefaultQty());
        map.put("status", acc.getStatus());
        map.put("sort", acc.getSort());
        map.put("updatedBy", acc.getUpdatedBy());
        map.put("updatedAt", acc.getUpdatedAt() != null ? acc.getUpdatedAt().format(DT_FMT) : "");
        return map;
    }

    private Map<String, Object> paramTypeToMap(EamParamType pt) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", pt.getId());
        map.put("categoryCode", pt.getCategoryCode());
        map.put("code", pt.getCode());
        map.put("name", pt.getName());
        map.put("unit", pt.getUnit());
        map.put("valueType", pt.getValueType());
        map.put("status", pt.getStatus());
        map.put("sort", pt.getSort());
        map.put("updatedBy", pt.getUpdatedBy());
        map.put("updatedAt", pt.getUpdatedAt() != null ? pt.getUpdatedAt().format(DT_FMT) : "");
        map.put("createdAt", pt.getCreatedAt() != null ? pt.getCreatedAt().format(DT_FMT) : "");
        return map;
    }

    private Map<String, Object> paramValueToMap(EamParamValue pv) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", pv.getId());
        map.put("paramTypeCode", pv.getParamTypeCode());
        map.put("categoryCode", pv.getCategoryCode());
        map.put("value", pv.getValue());
        map.put("sort", pv.getSort());
        map.put("status", pv.getStatus());
        map.put("updatedBy", pv.getUpdatedBy());
        map.put("updatedAt", pv.getUpdatedAt() != null ? pv.getUpdatedAt().format(DT_FMT) : "");
        map.put("createdAt", pv.getCreatedAt() != null ? pv.getCreatedAt().format(DT_FMT) : "");
        return map;
    }
}
