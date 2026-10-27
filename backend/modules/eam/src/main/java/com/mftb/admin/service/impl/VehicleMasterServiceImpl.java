package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.dto.VehicleMasterDto;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.entity.VehicleBrand;
import com.mftb.admin.entity.VehicleModel;
import com.mftb.admin.entity.VehicleSeries;
import com.mftb.admin.mapper.VehicleBrandMapper;
import com.mftb.admin.mapper.VehicleModelMapper;
import com.mftb.admin.mapper.VehicleSeriesMapper;
import com.mftb.admin.service.VehicleMasterService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 车辆参数库服务实现。
 *
 * <p>两条贯穿全类的规则：
 * <ol>
 *   <li><b>被引用就不能删</b>：三级中任意一级若仍被下一级或车辆档案引用，删除会被拒。
 *       否则车辆档案会留下指向已删记录的 ID，界面显示空白而没人知道为什么。</li>
 *   <li><b>子级必须属于声明的父级</b>：保存车系时校验品牌存在、保存车型时校验车系存在，
 *       且车系所属品牌必须与传入品牌一致——防止前端把"别的品牌的车系"混进来，
 *       形成 品牌=寶馬 / 车系=Cayenne(保时捷) 这种在统计里无法解释的组合。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VehicleMasterServiceImpl implements VehicleMasterService {

    private final VehicleBrandMapper brandMapper;
    private final VehicleSeriesMapper seriesMapper;
    private final VehicleModelMapper modelMapper;
    private final VehicleAccessGuard guard;
    private final OperatorResolver operatorResolver;

    /* ==================== 品牌 ==================== */

    @Override
    public List<VehicleMasterDto.BrandVO> listBrands(boolean includeDisabled) {
        Map<Long, Integer> seriesCounts = toCountMap(seriesMapper.countGroupedByBrand());
        Map<Long, Integer> vehicleCounts = toCountMap(brandMapper.countVehiclesGrouped());
        return brandMapper.listForSelect(includeDisabled ? 0 : 1).stream().map(b -> {
            VehicleMasterDto.BrandVO vo = new VehicleMasterDto.BrandVO();
            vo.setId(b.getId());
            vo.setBrandName(b.getBrandName());
            vo.setBrandNameEn(b.getBrandNameEn());
            vo.setCountryOrigin(b.getCountryOrigin());
            vo.setStatus(b.getStatus());
            vo.setSortOrder(b.getSortOrder());
            vo.setRemark(b.getRemark());
            vo.setSeriesCount(seriesCounts.getOrDefault(b.getId(), 0));
            vo.setVehicleCount(vehicleCounts.getOrDefault(b.getId(), 0));
            vo.setUpdatedBy(b.getUpdatedBy());
            vo.setUpdatedAt(DateTimeUtils.format(b.getUpdatedAt()));
            return vo;
        }).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long saveBrand(VehicleMasterDto.BrandSave save) {
        SysUser current = guard.currentUser();
        String name = requireText(save.getBrandName(), "請填寫品牌名稱");
        String status = normalizeStatus(save.getStatus());
        VehicleBrand brand = save.getId() == null ? new VehicleBrand() : requireExists(brandMapper, save.getId(), "品牌");
        boolean isNew = brand.getId() == null;
        brand.setBrandName(name);
        brand.setBrandNameEn(trimOrNull(save.getBrandNameEn()));
        brand.setCountryOrigin(trimOrNull(save.getCountryOrigin()));
        brand.setStatus(status);
        brand.setSortOrder(save.getSortOrder() == null ? 0 : save.getSortOrder());
        brand.setRemark(trimOrNull(save.getRemark()));
        brand.setUpdatedBy(operatorResolver.operatorSignature(current));
        try {
            if (isNew) {
                brand.setCreatedBy(brand.getUpdatedBy());
                brandMapper.insert(brand);
            } else {
                brand.setUpdatedAt(java.time.LocalDateTime.now());
                brandMapper.updateById(brand);
            }
        } catch (DuplicateKeyException e) {
            throw new BusinessException("品牌「" + name + "」已存在，請直接編輯既有記錄");
        }
        log.info("车辆品牌已保存: id={}, name={}, isNew={}", brand.getId(), name, isNew);
        return brand.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteBrand(long id) {
        guard.currentUser();
        VehicleBrand brand = requireExists(brandMapper, id, "品牌");
        int children = seriesMapper.countChildren(id);
        if (children > 0) {
            throw new BusinessException("該品牌下仍有 " + children + " 個車系，請先處理車系再刪除品牌");
        }
        int used = brandMapper.countVehiclesUsing(id);
        if (used > 0) {
            throw new BusinessException("已有 " + used + " 台車引用該品牌，不可刪除；如需停用請將狀態改為「停用」");
        }
        brandMapper.deleteById(id);
        log.info("车辆品牌已删除: id={}, name={}", id, brand.getBrandName());
    }

    /* ==================== 车系 ==================== */

    @Override
    public List<VehicleMasterDto.SeriesVO> listSeries(Long brandId, boolean includeDisabled) {
        Map<Long, Integer> modelCounts = toCountMap(modelMapper.countGroupedBySeries());
        Map<Long, Integer> vehicleCounts = toCountMap(seriesMapper.countVehiclesGrouped());
        Map<Long, String> brandNames = brandNameMap();
        return seriesMapper.listByBrand(brandId, includeDisabled ? 0 : 1).stream().map(x -> {
            VehicleMasterDto.SeriesVO vo = new VehicleMasterDto.SeriesVO();
            vo.setId(x.getId());
            vo.setBrandId(x.getBrandId());
            vo.setBrandName(brandNames.getOrDefault(x.getBrandId(), "—"));
            vo.setSeriesName(x.getSeriesName());
            vo.setBodyType(x.getBodyType());
            vo.setEnergyType(x.getEnergyType());
            vo.setSeatCount(x.getSeatCount());
            vo.setStatus(x.getStatus());
            vo.setRemark(x.getRemark());
            vo.setModelCount(modelCounts.getOrDefault(x.getId(), 0));
            vo.setVehicleCount(vehicleCounts.getOrDefault(x.getId(), 0));
            vo.setUpdatedBy(x.getUpdatedBy());
            vo.setUpdatedAt(DateTimeUtils.format(x.getUpdatedAt()));
            return vo;
        }).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long saveSeries(VehicleMasterDto.SeriesSave save) {
        SysUser current = guard.currentUser();
        String name = requireText(save.getSeriesName(), "請填寫車系名稱");
        if (save.getBrandId() == null || brandMapper.selectById(save.getBrandId()) == null) {
            throw new BusinessException("所屬品牌無效，請重新選擇品牌");
        }
        requireIn(save.getBodyType(), VehicleConstants.BODY_TYPES, "車身形式");
        requireIn(save.getEnergyType(), VehicleConstants.ENERGY_TYPES, "能源類型");
        int seats = save.getSeatCount() == null ? 5 : save.getSeatCount();
        if (seats <= 0 || seats > 60) {
            throw new BusinessException("座位數須在 1~60 之間");
        }

        VehicleSeries exists = save.getId() == null ? null : seriesMapper.selectById(save.getId());
        if (exists != null && exists.getId() != null && !save.getBrandId().equals(exists.getBrandId())) {
            throw new BusinessException("不支援變更車系的所屬品牌；請在正確品牌下新建，並刪除舊車系");
        }
        VehicleSeries series = exists == null ? new VehicleSeries() : exists;
        series.setBrandId(save.getBrandId());
        series.setSeriesName(name);
        series.setBodyType(save.getBodyType());
        series.setEnergyType(save.getEnergyType());
        series.setSeatCount(seats);
        series.setStatus(normalizeStatus(save.getStatus()));
        series.setRemark(trimOrNull(save.getRemark()));
        series.setUpdatedBy(operatorResolver.operatorSignature(current));
        boolean isNew = series.getId() == null;
        try {
            if (isNew) {
                series.setCreatedBy(series.getUpdatedBy());
                seriesMapper.insert(series);
            } else {
                series.setUpdatedAt(java.time.LocalDateTime.now());
                seriesMapper.updateById(series);
            }
        } catch (DuplicateKeyException e) {
            throw new BusinessException("該品牌下已存在同名車系「" + name + "」");
        }
        log.info("车系已保存: id={}, brandId={}, name={}", series.getId(), save.getBrandId(), name);
        return series.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteSeries(long id) {
        guard.currentUser();
        VehicleSeries series = requireExists(seriesMapper, id, "車系");
        int children = modelMapper.countChildren(id);
        if (children > 0) {
            throw new BusinessException("該車系下仍有 " + children + " 個年款車型，請先處理車型再刪除車系");
        }
        int used = seriesMapper.countVehiclesUsing(id);
        if (used > 0) {
            throw new BusinessException("已有 " + used + " 台車引用該車系，不可刪除；如需停用請將狀態改為「停用」");
        }
        seriesMapper.deleteById(id);
        log.info("车系已删除: id={}, name={}", id, series.getSeriesName());
    }

    /* ==================== 年款车型 ==================== */

    @Override
    public List<VehicleMasterDto.ModelVO> listModels(Long seriesId, boolean includeDisabled) {
        Map<Long, Integer> vehicleCounts = toCountMap(modelMapper.countVehiclesGrouped());
        Map<Long, VehicleSeries> seriesMap = new HashMap<>();
        seriesMapper.listByBrand(null, 0).forEach(x -> seriesMap.put(x.getId(), x));
        Map<Long, String> brandNames = brandNameMap();
        return modelMapper.listBySeries(seriesId, includeDisabled ? 0 : 1).stream().map(x -> {
            VehicleMasterDto.ModelVO vo = new VehicleMasterDto.ModelVO();
            vo.setId(x.getId());
            vo.setSeriesId(x.getSeriesId());
            VehicleSeries parent = seriesMap.get(x.getSeriesId());
            if (parent != null) {
                vo.setSeriesName(parent.getSeriesName());
                vo.setBrandName(brandNames.getOrDefault(parent.getBrandId(), "—"));
            }
            vo.setModelName(x.getModelName());
            vo.setYearLabel(x.getYearLabel());
            vo.setDisplacement(x.getDisplacement());
            vo.setGearbox(x.getGearbox());
            vo.setSeatCount(x.getSeatCount());
            vo.setBasePrice(x.getBasePrice());
            vo.setStatus(x.getStatus());
            vo.setRemark(x.getRemark());
            vo.setVehicleCount(vehicleCounts.getOrDefault(x.getId(), 0));
            vo.setUpdatedBy(x.getUpdatedBy());
            vo.setUpdatedAt(DateTimeUtils.format(x.getUpdatedAt()));
            return vo;
        }).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long saveModel(VehicleMasterDto.ModelSave save) {
        SysUser current = guard.currentUser();
        String name = requireText(save.getModelName(), "請填寫車型名稱");
        if (save.getSeriesId() == null) {
            throw new BusinessException("請選擇所屬車系");
        }
        VehicleSeries parent = seriesMapper.selectById(save.getSeriesId());
        if (parent == null) {
            throw new BusinessException("所屬車系無效，請重新選擇車系");
        }
        VehicleModel exists = save.getId() == null ? null : modelMapper.selectById(save.getId());
        if (exists != null && exists.getId() != null && !save.getSeriesId().equals(exists.getSeriesId())) {
            throw new BusinessException("不支援變更車型所屬車系；請在正確車系下新建");
        }
        VehicleModel model = exists == null ? new VehicleModel() : exists;
        model.setSeriesId(save.getSeriesId());
        model.setModelName(name);
        // 年款参与唯一键，给空串而不是 null：null 参与 CONCAT 会让生成列变 NULL，唯一约束就形同虚设
        model.setYearLabel(save.getYearLabel() == null ? "" : save.getYearLabel().trim());
        model.setDisplacement(trimOrNull(save.getDisplacement()));
        model.setGearbox(trimOrNull(save.getGearbox()));
        model.setSeatCount(save.getSeatCount());
        model.setBasePrice(save.getBasePrice());
        model.setStatus(normalizeStatus(save.getStatus()));
        model.setRemark(trimOrNull(save.getRemark()));
        model.setUpdatedBy(operatorResolver.operatorSignature(current));
        boolean isNew = model.getId() == null;
        try {
            if (isNew) {
                model.setCreatedBy(model.getUpdatedBy());
                modelMapper.insert(model);
            } else {
                model.setUpdatedAt(java.time.LocalDateTime.now());
                modelMapper.updateById(model);
            }
        } catch (DuplicateKeyException e) {
            throw new BusinessException("同車系下已存在「" + model.getYearLabel() + " " + name + "」");
        }
        log.info("年款车型已保存: id={}, seriesId={}, name={}", model.getId(), save.getSeriesId(), name);
        return model.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteModel(long id) {
        guard.currentUser();
        requireExists(modelMapper, id, "車型");
        int used = modelMapper.countVehiclesUsing(id);
        if (used > 0) {
            throw new BusinessException("已有 " + used + " 台車引用該車型，不可刪除；如需停用請將狀態改為「停用」");
        }
        modelMapper.deleteById(id);
        log.info("年款车型已删除: id={}", id);
    }

    /* ==================== 内部工具 ==================== */

    private Map<Long, String> brandNameMap() {
        Map<Long, String> map = new HashMap<>();
        brandMapper.listForSelect(0).forEach(b -> map.put(b.getId(), b.getBrandName()));
        return map;
    }

    private static Map<Long, Integer> toCountMap(List<Map<String, Object>> rows) {
        Map<Long, Integer> map = new HashMap<>();
        for (Map<String, Object> row : rows) {
            Object pid = row.get("parentId");
            Object cnt = row.get("cnt");
            if (pid instanceof Number p && cnt instanceof Number c) {
                map.put(p.longValue(), c.intValue());
            }
        }
        return map;
    }

    private static String requireText(String value, String message) {
        if (!StringUtils.hasText(value)) {
            throw new BusinessException(message);
        }
        return value.trim();
    }

    private static String trimOrNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static void requireIn(String value, java.util.Set<String> allowed, String label) {
        if (!StringUtils.hasText(value) || !allowed.contains(value)) {
            throw new BusinessException(label + "取值無效，僅接受：" + String.join("/", allowed.stream().sorted().toList()));
        }
    }

    private static String normalizeStatus(String status) {
        return VehicleConstants.MASTER_STATUSES.contains(status) ? status : "enabled";
    }

    private static <T> T requireExists(com.baomidou.mybatisplus.core.mapper.BaseMapper<T> mapper,
                                       long id, String label) {
        T found = mapper.selectById(id);
        if (found == null) {
            throw new BusinessException(label + "不存在或已被刪除");
        }
        return found;
    }
}
