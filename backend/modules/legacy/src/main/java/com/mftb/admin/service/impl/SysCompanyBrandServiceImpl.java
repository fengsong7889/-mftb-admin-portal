package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.SysCompanyBrand;
import com.mftb.admin.mapper.SysCompanyBrandMapper;
import com.mftb.admin.service.SysCompanyBrandService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 公司品牌配置服务实现
 * 内置内存缓存（id→code / id→label），首次查询后缓存，增删改时自动刷新
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysCompanyBrandServiceImpl implements SysCompanyBrandService {

    private final SysCompanyBrandMapper brandMapper;
    private final OperatorResolver operatorResolver;

    /** 缓存：brandId → code */
    private final Map<Long, String> codeCache = new ConcurrentHashMap<>();
    /** 缓存：brandId → labelZh */
    private final Map<Long, String> labelCache = new ConcurrentHashMap<>();
    /** 缓存是否已加载 */
    private volatile boolean cacheLoaded = false;

    /* ────────────────── 查询 ────────────────── */

    @Override
    public List<SysCompanyBrand> list(Integer status) {
        LambdaQueryWrapper<SysCompanyBrand> wrapper = new LambdaQueryWrapper<>();
        if (status != null) {
            wrapper.eq(SysCompanyBrand::getStatus, status);
        }
        wrapper.orderByAsc(SysCompanyBrand::getSortOrder);
        return brandMapper.selectList(wrapper);
    }

    @Override
    public List<Map<String, Object>> listOptions() {
        return list(1).stream().map(b -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", b.getId());
            m.put("code", b.getCode());
            m.put("labelZh", b.getLabelZh());
            m.put("labelEn", b.getLabelEn());
            return m;
        }).toList();
    }

    @Override
    public String getCodeById(Long brandId) {
        ensureCache();
        if (brandId == null) return "XX";
        return codeCache.getOrDefault(brandId, "XX");
    }

    @Override
    public String getLabelById(Long brandId) {
        ensureCache();
        if (brandId == null) return "";
        return labelCache.getOrDefault(brandId, "");
    }

    /* ────────────────── 增删改 ────────────────── */

    @Override
    public long create(SysCompanyBrand brand) {
        if (brand.getStatus() == null) brand.setStatus(1);
        brand.setUpdatedBy(operatorResolver.currentOperatorName());
        brandMapper.insert(brand);
        refreshCache();
        return brand.getId();
    }

    @Override
    public void update(Long id, SysCompanyBrand brand) {
        SysCompanyBrand existing = brandMapper.selectById(id);
        if (existing == null) throw new RuntimeException("品牌不存在");
        if (brand.getCode() != null) existing.setCode(brand.getCode());
        if (brand.getLabelZh() != null) existing.setLabelZh(brand.getLabelZh());
        if (brand.getLabelEn() != null) existing.setLabelEn(brand.getLabelEn());
        if (brand.getSortOrder() != null) existing.setSortOrder(brand.getSortOrder());
        if (brand.getRemark() != null) existing.setRemark(brand.getRemark());
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        brandMapper.updateById(existing);
        refreshCache();
    }

    @Override
    public void updateStatus(Long id, Integer status) {
        SysCompanyBrand existing = brandMapper.selectById(id);
        if (existing == null) throw new RuntimeException("品牌不存在");
        existing.setStatus(status);
        existing.setUpdatedBy(operatorResolver.currentOperatorName());
        brandMapper.updateById(existing);
        refreshCache();
    }

    @Override
    public void delete(Long id) {
        brandMapper.deleteById(id);
        refreshCache();
    }

    /* ────────────────── 缓存 ────────────────── */

    private void ensureCache() {
        if (!cacheLoaded) {
            synchronized (this) {
                if (!cacheLoaded) {
                    refreshCache();
                    cacheLoaded = true;
                }
            }
        }
    }

    private void refreshCache() {
        try {
            List<SysCompanyBrand> all = brandMapper.selectList(
                    new LambdaQueryWrapper<SysCompanyBrand>().eq(SysCompanyBrand::getStatus, 1));
            Map<Long, String> newCodes = new ConcurrentHashMap<>();
            Map<Long, String> newLabels = new ConcurrentHashMap<>();
            for (SysCompanyBrand b : all) {
                newCodes.put(b.getId(), b.getCode());
                newLabels.put(b.getId(), b.getLabelZh());
            }
            codeCache.clear();
            codeCache.putAll(newCodes);
            labelCache.clear();
            labelCache.putAll(newLabels);
            cacheLoaded = true;
        } catch (Exception e) {
            log.warn("刷新公司品牌缓存失败: {}", e.getMessage());
        }
    }
}
