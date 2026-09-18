package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.ConsumableBasicDataService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 耗材基础数据服务实现（分类 / 品牌 / 计量单位）
 * <p>
 * 与资产域基础数据物理隔离，耗材档案从本服务获取下拉数据源。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConsumableBasicDataServiceImpl implements ConsumableBasicDataService {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ConsumableCategoryMapper categoryMapper;
    private final ConsumableBrandMapper brandMapper;
    private final ConsumableUnitMapper unitMapper;
    private final OperatorResolver operatorResolver;

    /* ==================== 分类 ==================== */

    @Override
    public List<ConsumableCategoryVO> listCategories(String keyword) {
        LambdaQueryWrapper<ConsumableCategory> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(ConsumableCategory::getCode, kw)
                    .or().like(ConsumableCategory::getName, kw));
        }
        wrapper.orderByAsc(ConsumableCategory::getSortOrder).orderByAsc(ConsumableCategory::getId);
        List<ConsumableCategory> list = categoryMapper.selectList(wrapper);

        // 构建 parentName 映射
        Map<Long, String> nameMap = list.stream()
                .collect(Collectors.toMap(ConsumableCategory::getId, ConsumableCategory::getName, (a, b) -> a));

        return list.stream().map(c -> {
            ConsumableCategoryVO vo = new ConsumableCategoryVO();
            vo.setId(c.getId());
            vo.setCode(c.getCode());
            vo.setName(c.getName());
            vo.setParentId(c.getParentId());
            vo.setParentName(c.getParentId() != null && c.getParentId() > 0
                    ? nameMap.getOrDefault(c.getParentId(), "") : "");
            vo.setSortOrder(c.getSortOrder());
            vo.setStatus(c.getStatus());
            vo.setRemark(c.getRemark());
            vo.setCreatedBy(c.getCreatedBy());
            vo.setUpdatedBy(c.getUpdatedBy());
            vo.setUpdatedAt(c.getUpdatedAt() != null ? c.getUpdatedAt().format(DT_FMT) : "");
            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    public long createCategory(ConsumableCategorySaveDTO dto) {
        if (!StringUtils.hasText(dto.getCode())) throw new BusinessException("分類編碼不能為空");
        if (!StringUtils.hasText(dto.getName())) throw new BusinessException("分類名稱不能為空");
        // 编码唯一校验
        long count = categoryMapper.selectCount(new LambdaQueryWrapper<ConsumableCategory>()
                .eq(ConsumableCategory::getCode, dto.getCode()));
        if (count > 0) throw new BusinessException("分類編碼已存在：" + dto.getCode());

        ConsumableCategory entity = new ConsumableCategory();
        entity.setCode(dto.getCode().trim());
        entity.setName(dto.getName().trim());
        entity.setParentId(dto.getParentId() != null ? dto.getParentId() : 0L);
        entity.setSortOrder(dto.getSortOrder() != null ? dto.getSortOrder() : 0);
        entity.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "enabled");
        entity.setRemark(dto.getRemark() != null ? dto.getRemark() : "");
        fillOperator(entity, true);
        categoryMapper.insert(entity);
        return entity.getId();
    }

    @Override
    public void updateCategory(long id, ConsumableCategorySaveDTO dto) {
        ConsumableCategory entity = categoryMapper.selectById(id);
        if (entity == null) throw new BusinessException("分類不存在");
        if (StringUtils.hasText(dto.getCode())) {
            // 编码唯一校验（排除自身）
            long count = categoryMapper.selectCount(new LambdaQueryWrapper<ConsumableCategory>()
                    .eq(ConsumableCategory::getCode, dto.getCode()).ne(ConsumableCategory::getId, id));
            if (count > 0) throw new BusinessException("分類編碼已存在：" + dto.getCode());
            entity.setCode(dto.getCode().trim());
        }
        if (StringUtils.hasText(dto.getName())) entity.setName(dto.getName().trim());
        if (dto.getParentId() != null) entity.setParentId(dto.getParentId());
        if (dto.getSortOrder() != null) entity.setSortOrder(dto.getSortOrder());
        if (StringUtils.hasText(dto.getStatus())) entity.setStatus(dto.getStatus());
        if (dto.getRemark() != null) entity.setRemark(dto.getRemark());
        fillOperator(entity, false);
        categoryMapper.updateById(entity);
    }

    @Override
    public void deleteCategory(long id) {
        ConsumableCategory entity = categoryMapper.selectById(id);
        if (entity == null) throw new BusinessException("分類不存在");
        // 检查是否有子分类
        long childCount = categoryMapper.selectCount(new LambdaQueryWrapper<ConsumableCategory>()
                .eq(ConsumableCategory::getParentId, id));
        if (childCount > 0) throw new BusinessException("該分類下存在子分類，請先刪除子分類");
        categoryMapper.deleteById(id);
    }

    @Override
    public void toggleCategoryStatus(long id) {
        ConsumableCategory entity = categoryMapper.selectById(id);
        if (entity == null) throw new BusinessException("分類不存在");
        entity.setStatus("enabled".equals(entity.getStatus()) ? "disabled" : "enabled");
        fillOperator(entity, false);
        categoryMapper.updateById(entity);
    }

    /* ==================== 品牌 ==================== */

    @Override
    public List<ConsumableBrandVO> listBrands(String categoryType, String keyword) {
        LambdaQueryWrapper<ConsumableBrand> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(categoryType)) {
            wrapper.eq(ConsumableBrand::getCategoryType, categoryType.trim());
        }
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.like(ConsumableBrand::getName, kw)
                    .or().like(ConsumableBrand::getNameEn, kw);
        }
        wrapper.orderByAsc(ConsumableBrand::getName);
        List<ConsumableBrand> list = brandMapper.selectList(wrapper);
        return list.stream().map(b -> {
            ConsumableBrandVO vo = new ConsumableBrandVO();
            vo.setId(b.getId());
            vo.setCode(b.getCode());
            vo.setName(b.getName());
            vo.setNameEn(b.getNameEn());
            vo.setCategoryType(b.getCategoryType());
            vo.setLogo(b.getLogo());
            vo.setStatus(b.getStatus());
            vo.setRemark(b.getRemark());
            vo.setCreatedBy(b.getCreatedBy());
            vo.setUpdatedBy(b.getUpdatedBy());
            vo.setUpdatedAt(b.getUpdatedAt() != null ? b.getUpdatedAt().format(DT_FMT) : "");
            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    public long createBrand(ConsumableBrandSaveDTO dto) {
        if (!StringUtils.hasText(dto.getName())) throw new BusinessException("品牌名稱不能為空");
        long count = brandMapper.selectCount(new LambdaQueryWrapper<ConsumableBrand>()
                .eq(ConsumableBrand::getName, dto.getName()));
        if (count > 0) throw new BusinessException("品牌名稱已存在：" + dto.getName());

        ConsumableBrand entity = new ConsumableBrand();
        entity.setCode(dto.getCode());
        entity.setName(dto.getName().trim());
        entity.setNameEn(dto.getNameEn() != null ? dto.getNameEn().trim() : "");
        entity.setCategoryType(StringUtils.hasText(dto.getCategoryType()) ? dto.getCategoryType() : "CONSUMABLE");
        entity.setLogo(dto.getLogo() != null ? dto.getLogo() : "");
        entity.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "enabled");
        entity.setRemark(dto.getRemark() != null ? dto.getRemark() : "");
        fillOperatorBrand(entity, true);
        brandMapper.insert(entity);
        return entity.getId();
    }

    @Override
    public void updateBrand(long id, ConsumableBrandSaveDTO dto) {
        ConsumableBrand entity = brandMapper.selectById(id);
        if (entity == null) throw new BusinessException("品牌不存在");
        if (dto.getCode() != null) entity.setCode(dto.getCode());
        if (StringUtils.hasText(dto.getName())) {
            long count = brandMapper.selectCount(new LambdaQueryWrapper<ConsumableBrand>()
                    .eq(ConsumableBrand::getName, dto.getName()).ne(ConsumableBrand::getId, id));
            if (count > 0) throw new BusinessException("品牌名稱已存在：" + dto.getName());
            entity.setName(dto.getName().trim());
        }
        if (dto.getNameEn() != null) entity.setNameEn(dto.getNameEn().trim());
        if (StringUtils.hasText(dto.getCategoryType())) entity.setCategoryType(dto.getCategoryType());
        if (dto.getLogo() != null) entity.setLogo(dto.getLogo());
        if (StringUtils.hasText(dto.getStatus())) entity.setStatus(dto.getStatus());
        if (dto.getRemark() != null) entity.setRemark(dto.getRemark());
        fillOperatorBrand(entity, false);
        brandMapper.updateById(entity);
    }

    @Override
    public void deleteBrand(long id) {
        ConsumableBrand entity = brandMapper.selectById(id);
        if (entity == null) throw new BusinessException("品牌不存在");
        brandMapper.deleteById(id);
    }

    @Override
    public void toggleBrandStatus(long id) {
        ConsumableBrand entity = brandMapper.selectById(id);
        if (entity == null) throw new BusinessException("品牌不存在");
        entity.setStatus("enabled".equals(entity.getStatus()) ? "disabled" : "enabled");
        fillOperatorBrand(entity, false);
        brandMapper.updateById(entity);
    }

    @Override
    public ConsumableBrandVO getBrandDetail(long id) {
        ConsumableBrand entity = brandMapper.selectById(id);
        if (entity == null) throw new BusinessException("品牌不存在");
        ConsumableBrandVO vo = new ConsumableBrandVO();
        vo.setId(entity.getId());
        vo.setCode(entity.getCode());
        vo.setName(entity.getName());
        vo.setNameEn(entity.getNameEn());
        vo.setCategoryType(entity.getCategoryType());
        vo.setLogo(entity.getLogo());
        vo.setStatus(entity.getStatus());
        vo.setRemark(entity.getRemark());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setUpdatedAt(entity.getUpdatedAt() != null ? entity.getUpdatedAt().format(DT_FMT) : "");
        return vo;
    }

    /* ==================== 计量单位 ==================== */

    @Override
    public List<ConsumableUnitVO> listUnits(String keyword) {
        LambdaQueryWrapper<ConsumableUnit> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(ConsumableUnit::getName, kw)
                    .or().like(ConsumableUnit::getAbbr, kw));
        }
        wrapper.orderByAsc(ConsumableUnit::getSortOrder).orderByAsc(ConsumableUnit::getId);
        List<ConsumableUnit> list = unitMapper.selectList(wrapper);
        return list.stream().map(u -> {
            ConsumableUnitVO vo = new ConsumableUnitVO();
            vo.setId(u.getId());
            vo.setName(u.getName());
            vo.setAbbr(u.getAbbr());
            vo.setSortOrder(u.getSortOrder());
            vo.setStatus(u.getStatus());
            vo.setCreatedBy(u.getCreatedBy());
            vo.setUpdatedBy(u.getUpdatedBy());
            vo.setUpdatedAt(u.getUpdatedAt() != null ? u.getUpdatedAt().format(DT_FMT) : "");
            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    public long createUnit(ConsumableUnitSaveDTO dto) {
        if (!StringUtils.hasText(dto.getName())) throw new BusinessException("單位名稱不能為空");
        long count = unitMapper.selectCount(new LambdaQueryWrapper<ConsumableUnit>()
                .eq(ConsumableUnit::getName, dto.getName()));
        if (count > 0) throw new BusinessException("單位名稱已存在：" + dto.getName());

        ConsumableUnit entity = new ConsumableUnit();
        entity.setName(dto.getName().trim());
        entity.setAbbr(dto.getAbbr() != null ? dto.getAbbr().trim() : "");
        entity.setSortOrder(dto.getSortOrder() != null ? dto.getSortOrder() : 0);
        entity.setStatus(StringUtils.hasText(dto.getStatus()) ? dto.getStatus() : "enabled");
        fillOperatorUnit(entity, true);
        unitMapper.insert(entity);
        return entity.getId();
    }

    @Override
    public void updateUnit(long id, ConsumableUnitSaveDTO dto) {
        ConsumableUnit entity = unitMapper.selectById(id);
        if (entity == null) throw new BusinessException("單位不存在");
        if (StringUtils.hasText(dto.getName())) {
            long count = unitMapper.selectCount(new LambdaQueryWrapper<ConsumableUnit>()
                    .eq(ConsumableUnit::getName, dto.getName()).ne(ConsumableUnit::getId, id));
            if (count > 0) throw new BusinessException("單位名稱已存在：" + dto.getName());
            entity.setName(dto.getName().trim());
        }
        if (dto.getAbbr() != null) entity.setAbbr(dto.getAbbr().trim());
        if (dto.getSortOrder() != null) entity.setSortOrder(dto.getSortOrder());
        if (StringUtils.hasText(dto.getStatus())) entity.setStatus(dto.getStatus());
        fillOperatorUnit(entity, false);
        unitMapper.updateById(entity);
    }

    @Override
    public void deleteUnit(long id) {
        ConsumableUnit entity = unitMapper.selectById(id);
        if (entity == null) throw new BusinessException("單位不存在");
        unitMapper.deleteById(id);
    }

    /* ==================== 工具方法 ==================== */

    private void fillOperator(ConsumableCategory entity, boolean isNew) {
        String opName = operatorResolver.currentOperatorName();
        if (isNew) {
            entity.setCreatedBy(opName);
            entity.setCreatedAt(LocalDateTime.now());
        }
        entity.setUpdatedBy(opName);
        entity.setUpdatedAt(LocalDateTime.now());
    }

    private void fillOperatorBrand(ConsumableBrand entity, boolean isNew) {
        String opName = operatorResolver.currentOperatorName();
        if (isNew) {
            entity.setCreatedBy(opName);
            entity.setCreatedAt(LocalDateTime.now());
        }
        entity.setUpdatedBy(opName);
        entity.setUpdatedAt(LocalDateTime.now());
    }

    private void fillOperatorUnit(ConsumableUnit entity, boolean isNew) {
        String opName = operatorResolver.currentOperatorName();
        if (isNew) {
            entity.setCreatedBy(opName);
            entity.setCreatedAt(LocalDateTime.now());
        }
        entity.setUpdatedBy(opName);
        entity.setUpdatedAt(LocalDateTime.now());
    }
}
