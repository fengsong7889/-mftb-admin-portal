package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
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
import com.mftb.admin.service.EamAssetLifecycleService;
import com.mftb.admin.service.EamScrapService;
import com.mftb.admin.util.BizSeqService;
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
import java.util.Set;

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
    private final EamAssetLifecycleService lifecycleService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    /** 不允许直接登记报废的资产状态（需走各自终态流程） */
    private static final Set<String> SCRAP_BLOCKED_STATUSES = Set.of("scrapped", "lost", "written_off", "pending_inspection");

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

        // 幂等：同操作人同请求键直接返回既有报废单
        var currentUser = operatorResolver.currentUser();
        Long operatorId = currentUser != null ? currentUser.getId() : null;
        if (StringUtils.hasText(dto.getRequestKey())) {
            Long prior = lifecycleService.findBizIdByRequestKey(operatorId, dto.getRequestKey());
            if (prior != null) {
                log.info("報廢登記冪等命中：requestKey={}, scrapId={}", dto.getRequestKey(), prior);
                return prior;
            }
        }

        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, dto.getAssetId()).last("FOR UPDATE"));
        if (asset == null) throw new BusinessException("資產不存在");
        if (SCRAP_BLOCKED_STATUSES.contains(asset.getStatus())) {
            throw new BusinessException("當前資產狀態不允許直接報廢（" + asset.getStatus() + "），請走對應異常流程");
        }

        LocalDate scrapDate = StringUtils.hasText(dto.getScrapDate())
                ? LocalDate.parse(dto.getScrapDate()) : LocalDate.now();
        Long holderId = asset.getCurrentHolderId();

        String operator = operatorResolver.currentOperatorName();
        EamScrap scrap = new EamScrap();
        BeanUtils.copyProperties(dto, scrap, "assetId", "scrapDate", "residualValue");
        scrap.setAssetId(asset.getId());
        scrap.setScrapNo(bizSeqService.next(BizSeqService.RULE_EAM_SCRAP));
        scrap.setScrapDate(scrapDate);
        // 资产快照统一以台账为准，避免前端传值与真实资产不一致
        scrap.setAssetNo(asset.getAssetNo());
        scrap.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
        scrap.setAssetType(asset.getCategoryCode());
        scrap.setBrand(asset.getBrand());
        scrap.setCompanyBrand(asset.getCompanyBrand());
        if (dto.getResidualValue() != null) scrap.setResidualValue(dto.getResidualValue());
        // 流程暂不启用：提交后直接生效
        scrap.setStatus("approved");
        scrap.setCreatedBy(operator);
        scrap.setUpdatedBy(operator);
        scrapMapper.insert(scrap);

        // 关闭有效来源（领用/借用）→ scrap_closed，并回填原持有人/来源快照
        EamAssetLifecycleService.ClosedSource closed = lifecycleService.closeActiveSource(
                asset, EamAssetLifecycleService.CLOSE_SCRAP, scrap.getId(), "報廢登記：" + dto.getReason());
        scrap.setOriginalHolderId(holderId);
        scrap.setOriginalHolderName(asset.getUserName());
        if ("claim".equals(closed.sourceType())) scrap.setSourceClaimId(closed.sourceId());
        else if ("borrow".equals(closed.sourceType())) scrap.setSourceBorrowId(closed.sourceId());
        scrapMapper.updateById(scrap);

        // 记录持有关系状态事件（释放前，asset 仍为旧状态）
        lifecycleService.recordEvent(asset, "scrap", scrap.getId(), closed, "scrapped", asset.getDepartment(), scrapDate, dto.getRequestKey());

        // 解除持有关系并置为已报废（scrapTime 由实体非空带出）
        asset.setScrapTime(scrapDate.toString());
        lifecycleService.releaseAssetToStatus(asset, "scrapped", null, null);

        log.info("创建报废记录：资产 {} ({}), 申请人 {}, 残值 {}, closedSource={}",
                asset.getAssetNo(), asset.getAssetName(), dto.getApplyBy(), scrap.getResidualValue(), closed.sourceType());
        return scrap.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        EamScrap scrap = scrapMapper.selectById(id);
        if (scrap == null) throw new BusinessException("報廢記錄不存在");

        // 删除报废记录
        scrapMapper.deleteById(id);

        // 恢复资产状态为闲置，清除报废时间（scrap_time 需用 UpdateWrapper 显式置 null）
        if (scrap.getAssetId() != null) {
            EamAsset asset = assetMapper.selectOne(
                    new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, scrap.getAssetId()).last("FOR UPDATE"));
            if (asset != null && "scrapped".equals(asset.getStatus())) {
                asset.setStatus("idle");
                asset.setUpdatedBy(operatorResolver.currentOperatorName());
                assetMapper.update(asset, new UpdateWrapper<EamAsset>()
                        .eq("id", asset.getId())
                        .set("status", "idle")
                        .set("scrap_time", null)
                        .set("current_holder_id", null)
                        .set("user_name", null)
                        .set("active_claim_id", null));
            }
        }

        log.info("删除报废记录并恢复资产闲置：资产 {} (id={})", scrap.getAssetNo(), id);
    }

    /** 搜索区过滤：报废编号/资产编码/名称/分类/品牌/报废时间/经办人/处置方式/创建时间/更新人/更新时间 */
    private LambdaQueryWrapper<EamScrap> buildWrapper(EamScrapQuery query) {
        LambdaQueryWrapper<EamScrap> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getScrapNo())) wrapper.like(EamScrap::getScrapNo, query.getScrapNo().trim());
        if (StringUtils.hasText(query.getAssetKeyword())) {
            String kw = query.getAssetKeyword().trim();
            wrapper.and(x -> x.like(EamScrap::getAssetNo, kw).or().like(EamScrap::getAssetName, kw));
        }
        if (StringUtils.hasText(query.getAssetType())) wrapper.eq(EamScrap::getAssetType, query.getAssetType().trim());
        if (StringUtils.hasText(query.getBrand())) wrapper.like(EamScrap::getBrand, query.getBrand().trim());
        if (query.getCompanyBrand() != null) wrapper.eq(EamScrap::getCompanyBrand, query.getCompanyBrand());
        if (StringUtils.hasText(query.getScrapDateStart())) wrapper.ge(EamScrap::getScrapDate, query.getScrapDateStart().trim());
        if (StringUtils.hasText(query.getScrapDateEnd())) wrapper.le(EamScrap::getScrapDate, query.getScrapDateEnd().trim());
        if (StringUtils.hasText(query.getApplyBy())) wrapper.like(EamScrap::getApplyBy, query.getApplyBy().trim());
        if (StringUtils.hasText(query.getDisposeType())) wrapper.eq(EamScrap::getDisposeType, query.getDisposeType().trim());
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
