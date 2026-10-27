package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.ConsumableBasicDataService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 耗材基础数据服务实现（分类 / 品牌）
 * <p>
 * 耗材档案从本服务获取下拉数据源。本实现只保留读取：分类与品牌物理上住在资产域
 * 统一表（biz_eam_category / biz_eam_brand，用 biz_type 区分），写入与维护走
 * {@link EamBasicDataServiceImpl} 一条入口，避免同一张表上两套校验逻辑漂移。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConsumableBasicDataServiceImpl implements ConsumableBasicDataService {

    private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** 业务类型：耗材 */
    private static final String BIZ_CONSUMABLE = "CONSUMABLE";

    private final EamCategoryMapper categoryMapper;
    private final EamBrandMapper brandMapper;

    /* ==================== 分类（统一分类库 biz_type=CONSUMABLE） ==================== */

    @Override
    public List<ConsumableCategoryVO> listCategories(String keyword) {
        LambdaQueryWrapper<EamCategory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EamCategory::getBizType, BIZ_CONSUMABLE);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(EamCategory::getCode, kw)
                    .or().like(EamCategory::getName, kw));
        }
        wrapper.orderByAsc(EamCategory::getSort).orderByAsc(EamCategory::getId);
        List<EamCategory> list = categoryMapper.selectList(wrapper);

        // 构建 parentName 映射
        Map<Long, String> nameMap = list.stream()
                .collect(Collectors.toMap(EamCategory::getId, EamCategory::getName, (a, b) -> a));

        return list.stream().map(c -> {
            ConsumableCategoryVO vo = new ConsumableCategoryVO();
            vo.setId(c.getId());
            vo.setCode(c.getCode());
            vo.setName(c.getName());
            vo.setParentId(c.getParentId());
            vo.setParentName(c.getParentId() != null && c.getParentId() > 0
                    ? nameMap.getOrDefault(c.getParentId(), "") : "");
            vo.setSortOrder(c.getSort());
            vo.setStatus(c.getStatus());
            vo.setRemark(c.getRemark());
            vo.setCreatedBy("");
            vo.setUpdatedBy(c.getUpdatedBy());
            vo.setUpdatedAt(c.getUpdatedAt() != null ? c.getUpdatedAt().format(DT_FMT) : "");
            return vo;
        }).collect(Collectors.toList());
    }

    /* ==================== 品牌（统一品牌产品库 biz_type=CONSUMABLE） ==================== */

    @Override
    public List<ConsumableBrandVO> listBrands(String categoryType, String keyword) {
        LambdaQueryWrapper<EamBrand> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(EamBrand::getBizType, StringUtils.hasText(categoryType) ? categoryType.trim() : BIZ_CONSUMABLE);
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(EamBrand::getBrandZh, kw)
                    .or().like(EamBrand::getBrandEn, kw));
        }
        wrapper.orderByAsc(EamBrand::getBrandZh);
        List<EamBrand> list = brandMapper.selectList(wrapper);
        return list.stream().map(b -> {
            ConsumableBrandVO vo = new ConsumableBrandVO();
            vo.setId(b.getId());
            vo.setCode(b.getCode());
            vo.setName(b.getBrandZh());
            vo.setNameEn(b.getBrandEn());
            vo.setCategoryType(b.getBizType());
            vo.setLogo(b.getBrandLogo());
            vo.setStatus(b.getStatus());
            vo.setRemark(b.getRemark());
            vo.setCreatedBy("");
            vo.setUpdatedBy(b.getUpdatedBy());
            vo.setUpdatedAt(b.getUpdatedAt() != null ? b.getUpdatedAt().format(DT_FMT) : "");
            return vo;
        }).collect(Collectors.toList());
    }
}
