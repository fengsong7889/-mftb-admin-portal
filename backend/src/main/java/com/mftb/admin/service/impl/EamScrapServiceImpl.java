package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamScrapQuery;
import com.mftb.admin.dto.EamScrapSaveDTO;
import com.mftb.admin.dto.EamScrapVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamScrap;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamScrapMapper;
import com.mftb.admin.service.EamScrapService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.util.List;

/**
 * 资产报废记录服务实现
 * <p>
 * 报废流程暂未启用：创建即生效（status=approved），并将资产台账置为已报废。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamScrapServiceImpl implements EamScrapService {

    private final EamScrapMapper scrapMapper;
    private final EamAssetMapper assetMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<EamScrapVO> page(EamScrapQuery query) {
        Page<EamScrap> page = scrapMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                buildWrapper(query).orderByDesc(EamScrap::getCreatedAt, EamScrap::getId));
        List<EamScrapVO> records = page.getRecords().stream().map(this::toVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamScrapVO detail(long id) {
        EamScrap scrap = scrapMapper.selectById(id);
        if (scrap == null) throw new BusinessException("報廢記錄不存在");
        return toVO(scrap);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long create(EamScrapSaveDTO dto) {
        if (dto.getAssetId() == null) throw new BusinessException("資產 ID 不能為空");
        if (!StringUtils.hasText(dto.getReason())) throw new BusinessException("報廢原因不能為空");
        if (!StringUtils.hasText(dto.getApplyBy())) throw new BusinessException("申請人不能為空");

        EamAsset asset = assetMapper.selectById(dto.getAssetId());
        if (asset == null) throw new BusinessException("資產不存在");
        if ("scrapped".equals(asset.getStatus())) throw new BusinessException("該資產已報廢");

        LocalDate scrapDate = StringUtils.hasText(dto.getScrapDate())
                ? LocalDate.parse(dto.getScrapDate()) : LocalDate.now();

        String operator = operatorResolver.currentOperatorName();
        EamScrap scrap = new EamScrap();
        BeanUtils.copyProperties(dto, scrap, "assetId", "scrapDate", "residualValue");
        scrap.setAssetId(asset.getId());
        scrap.setScrapDate(scrapDate);
        // 资产快照统一以台账为准，避免前端传值与真实资产不一致
        scrap.setAssetNo(asset.getAssetNo());
        scrap.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
        scrap.setAssetType(asset.getCategoryCode());
        scrap.setBrand(asset.getBrand());
        if (dto.getResidualValue() != null) scrap.setResidualValue(dto.getResidualValue());
        // 流程暂不启用：提交后直接生效
        scrap.setStatus("approved");
        scrap.setCreatedBy(operator);
        scrap.setUpdatedBy(operator);
        scrapMapper.insert(scrap);

        // 同步资产台账：置为已报废并记录报废时间
        asset.setStatus("scrapped");
        asset.setScrapTime(scrapDate.toString());
        asset.setUpdatedBy(operator);
        assetMapper.updateById(asset);

        log.info("创建报废记录：资产 {} ({}), 申请人 {}, 残值 {}",
                asset.getAssetNo(), asset.getAssetName(), dto.getApplyBy(), scrap.getResidualValue());
        return scrap.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        EamScrap scrap = scrapMapper.selectById(id);
        if (scrap == null) throw new BusinessException("報廢記錄不存在");
        if (!"pending".equals(scrap.getStatus())) throw new BusinessException("僅允許刪除待審批的記錄");

        scrapMapper.deleteById(id);
        log.info("删除报废记录：{} (id={})", scrap.getAssetNo(), id);
    }

    /** 搜索区过滤：编号/名称/分类/品牌/报废时间/申请人/处置方式/状态/创建时间/更新人/更新时间 */
    private LambdaQueryWrapper<EamScrap> buildWrapper(EamScrapQuery query) {
        LambdaQueryWrapper<EamScrap> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getAssetNo())) wrapper.like(EamScrap::getAssetNo, query.getAssetNo().trim());
        if (StringUtils.hasText(query.getAssetName())) wrapper.like(EamScrap::getAssetName, query.getAssetName().trim());
        if (StringUtils.hasText(query.getAssetType())) wrapper.eq(EamScrap::getAssetType, query.getAssetType().trim());
        if (StringUtils.hasText(query.getBrand())) wrapper.like(EamScrap::getBrand, query.getBrand().trim());
        if (StringUtils.hasText(query.getScrapDateStart())) wrapper.ge(EamScrap::getScrapDate, query.getScrapDateStart().trim());
        if (StringUtils.hasText(query.getScrapDateEnd())) wrapper.le(EamScrap::getScrapDate, query.getScrapDateEnd().trim());
        if (StringUtils.hasText(query.getApplyBy())) wrapper.like(EamScrap::getApplyBy, query.getApplyBy().trim());
        if (StringUtils.hasText(query.getDisposeType())) wrapper.eq(EamScrap::getDisposeType, query.getDisposeType().trim());
        if (StringUtils.hasText(query.getStatus())) wrapper.eq(EamScrap::getStatus, query.getStatus().trim());
        if (StringUtils.hasText(query.getCreatedAtStart())) wrapper.ge(EamScrap::getCreatedAt, query.getCreatedAtStart().trim());
        if (StringUtils.hasText(query.getCreatedAtEnd())) wrapper.lt(EamScrap::getCreatedAt, query.getCreatedAtEnd().trim() + " 23:59:59");
        if (StringUtils.hasText(query.getUpdatedBy())) wrapper.like(EamScrap::getUpdatedBy, query.getUpdatedBy().trim());
        if (StringUtils.hasText(query.getUpdatedAtStart())) wrapper.ge(EamScrap::getUpdatedAt, query.getUpdatedAtStart().trim());
        if (StringUtils.hasText(query.getUpdatedAtEnd())) wrapper.lt(EamScrap::getUpdatedAt, query.getUpdatedAtEnd().trim() + " 23:59:59");
        return wrapper;
    }

    private EamScrapVO toVO(EamScrap scrap) {
        EamScrapVO vo = new EamScrapVO();
        BeanUtils.copyProperties(scrap, vo, "scrapDate", "createdAt", "updatedAt");
        vo.setScrapDate(scrap.getScrapDate() != null ? scrap.getScrapDate().toString() : null);
        vo.setCreatedAt(DateTimeUtils.format(scrap.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(scrap.getUpdatedAt()));
        return vo;
    }
}
