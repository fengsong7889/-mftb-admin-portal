package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamRepairSaveDTO;
import com.mftb.admin.dto.EamRepairVO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamRepair;
import com.mftb.admin.entity.EamReturn;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamRepairMapper;
import com.mftb.admin.mapper.EamReturnMapper;
import com.mftb.admin.service.EamAssetLifecycleService;
import com.mftb.admin.service.EamRepairService;
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
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamRepairServiceImpl implements EamRepairService {

    private final EamRepairMapper repairMapper;
    private final EamAssetMapper assetMapper;
    private final EamReturnMapper returnMapper;
    private final EamAssetLifecycleService lifecycleService;
    private final OperatorResolver operatorResolver;

    private static final List<String> VALID_STATUSES = List.of("repairing", "done");
    /** 允许直接送修的资产状态 */
    private static final Set<String> REPAIRABLE_STATUSES = Set.of("idle", "in_use", "pending_disposal");

    @Override
    public List<EamRepairVO> list(Long assetId, String status) {
        LambdaQueryWrapper<EamRepair> wrapper = new LambdaQueryWrapper<>();
        if (assetId != null) {
            wrapper.eq(EamRepair::getAssetId, assetId);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(EamRepair::getStatus, status);
        }
        wrapper.orderByDesc(EamRepair::getCreatedAt, EamRepair::getId);
        List<EamRepair> records = repairMapper.selectList(wrapper);
        List<EamRepairVO> vos = records.stream().map(this::toVO).toList();
        fillBrands(vos);
        return vos;
    }

    /** 批量填充资产品牌（来自关联资产表，避免 N+1 查询） */
    private void fillBrands(List<EamRepairVO> vos) {
        if (vos.isEmpty()) return;
        List<Long> assetIds = vos.stream().map(EamRepairVO::getAssetId).filter(java.util.Objects::nonNull).distinct().toList();
        if (assetIds.isEmpty()) return;
        Map<Long, String> brandMap = assetMapper.selectList(
                        new LambdaQueryWrapper<EamAsset>().select(EamAsset::getId, EamAsset::getBrand).in(EamAsset::getId, assetIds))
                .stream().collect(java.util.stream.Collectors.toMap(EamAsset::getId, a -> a.getBrand() == null ? "" : a.getBrand()));
        vos.forEach(vo -> vo.setBrand(brandMap.get(vo.getAssetId())));
    }

    @Override
    public EamRepairVO detail(long id) {
        EamRepair repair = repairMapper.selectById(id);
        if (repair == null) throw new BusinessException("维修记录不存在");
        EamRepairVO vo = toVO(repair);
        fillBrands(List.of(vo));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long create(EamRepairSaveDTO dto) {
        if (dto.getAssetId() == null) throw new BusinessException("资产 ID 不能为空");
        if (!StringUtils.hasText(dto.getFaultDesc())) throw new BusinessException("故障描述不能为空");
        if (!StringUtils.hasText(dto.getRepairContent())) throw new BusinessException("维修内容不能为空");
        if (!StringUtils.hasText(dto.getRepairBy())) throw new BusinessException("维修方不能为空");

        // 幂等：同操作人同请求键直接返回既有维修记录
        var currentUser = operatorResolver.currentUser();
        Long operatorId = currentUser != null ? currentUser.getId() : null;
        if (StringUtils.hasText(dto.getRequestKey())) {
            Long prior = lifecycleService.findBizIdByRequestKey(operatorId, dto.getRequestKey());
            if (prior != null) {
                log.info("送修登记幂等命中：requestKey={}, repairId={}", dto.getRequestKey(), prior);
                return prior;
            }
        }

        // 验证资产存在并加行锁
        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, dto.getAssetId()).last("FOR UPDATE"));
        if (asset == null) throw new BusinessException("资产不存在");
        if (!REPAIRABLE_STATUSES.contains(asset.getStatus())) {
            throw new BusinessException("当前资产状态不允许直接送修（仅闲置/使用中/待处置可送修）");
        }
        Long openRepairs = repairMapper.selectCount(new LambdaQueryWrapper<EamRepair>()
                .eq(EamRepair::getAssetId, asset.getId()).eq(EamRepair::getStatus, "repairing"));
        if (openRepairs != null && openRepairs > 0) {
            throw new BusinessException("该资产已有进行中的维修记录，不可重复送修");
        }

        EamRepair repair = new EamRepair();
        BeanUtils.copyProperties(dto, repair);
        repair.setAssetNo(asset.getAssetNo());
        repair.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
        repair.setStatus("repairing");
        repair.setHoldType(asset.getHoldType());
        repair.setOriginalHolderId(asset.getCurrentHolderId());
        repair.setOriginalHolderName(asset.getUserName());
        repair.setRequestKey(StringUtils.hasText(dto.getRequestKey()) ? dto.getRequestKey() : null);
        repair.setCreatedBy(operatorResolver.currentOperatorName());
        repair.setUpdatedBy(operatorResolver.currentOperatorName());
        repairMapper.insert(repair);

        // 送修即收回：关闭有效来源→ repair_closed，并回填来源快照
        EamAssetLifecycleService.ClosedSource closed = lifecycleService.closeActiveSource(
                asset, EamAssetLifecycleService.CLOSE_REPAIR, repair.getId(), "送修登记：" + dto.getFaultDesc());
        if ("claim".equals(closed.sourceType())) repair.setSourceClaimId(closed.sourceId());
        else if ("borrow".equals(closed.sourceType())) repair.setSourceBorrowId(closed.sourceId());
        repairMapper.updateById(repair);

        LocalDate bizDate = parseDateOrToday(dto.getRepairDate());
        lifecycleService.recordEvent(asset, "repair", repair.getId(), closed, "in_repair", asset.getDepartment(), bizDate, dto.getRequestKey());

        // 解除持有关系并置为维修中（清持有人/领用关联，维修完成后回库闲置）
        lifecycleService.releaseAssetToStatus(asset, "in_repair", null, null);

        log.info("创建维修记录：资产 {} ({}), 维修方 {}, closedSource={}",
                asset.getAssetNo(), asset.getAssetName(), dto.getRepairBy(), closed.sourceType());
        return repair.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void finish(long id, String finishDate) {
        EamRepair repair = repairMapper.selectById(id);
        if (repair == null) throw new BusinessException("维修记录不存在");
        if ("done".equals(repair.getStatus())) throw new BusinessException("维修已完成，无需重复操作");

        repair.setStatus("done");
        repair.setFinishDate(finishDate);
        repair.setUpdatedBy(operatorResolver.currentOperatorName());
        repairMapper.updateById(repair);

        // 仅当该资产无其它进行中维修时，维修完成回库闲置并显式解除持有关系（清持有人/领用关联）
        Long remaining = repairMapper.selectCount(new LambdaQueryWrapper<EamRepair>()
                .eq(EamRepair::getAssetId, repair.getAssetId()).eq(EamRepair::getStatus, "repairing"));
        if (remaining == null || remaining == 0) {
            EamAsset asset = assetMapper.selectOne(
                    new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, repair.getAssetId()).last("FOR UPDATE"));
            if (asset != null && "in_repair".equals(asset.getStatus())) {
                lifecycleService.releaseAssetToStatus(asset, "idle", null, null);
            }
        }

        // 若本维修由归还处置(apply_repair)触发，维修完成后回写关联归还单为异常已结束
        if (repair.getReturnId() != null) {
            EamReturn ret = returnMapper.selectById(repair.getReturnId());
            if (ret != null && "exception_pending".equals(ret.getReturnStatus())
                    && "apply_repair".equals(ret.getDisposition())) {
                ret.setReturnStatus("exception_closed");
                ret.setUpdatedBy(operatorResolver.currentOperatorName());
                returnMapper.updateById(ret);
            }
        }

        log.info("完成维修记录：{}，资产 {} 无其它进行中维修时回库闲置", repair.getAssetNo(), repair.getAssetNo());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void update(long id, EamRepairSaveDTO dto) {
        EamRepair repair = repairMapper.selectById(id);
        if (repair == null) throw new BusinessException("维修记录不存在");
        if (!"repairing".equals(repair.getStatus())) throw new BusinessException("仅允许编辑维修中的记录");

        if (StringUtils.hasText(dto.getFaultDesc())) repair.setFaultDesc(dto.getFaultDesc());
        if (StringUtils.hasText(dto.getRepairContent())) repair.setRepairContent(dto.getRepairContent());
        if (StringUtils.hasText(dto.getRepairBy())) repair.setRepairBy(dto.getRepairBy());
        if (dto.getCost() != null) repair.setCost(dto.getCost());
        if (StringUtils.hasText(dto.getRepairDate())) repair.setRepairDate(dto.getRepairDate());
        if (StringUtils.hasText(dto.getApplicant())) repair.setApplicant(dto.getApplicant());
        if (StringUtils.hasText(dto.getCauseType())) repair.setCauseType(dto.getCauseType());
        repair.setUpdatedBy(operatorResolver.currentOperatorName());
        repairMapper.updateById(repair);

        log.info("更新维修记录：{} (id={})", repair.getAssetNo(), id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(long id) {
        EamRepair repair = repairMapper.selectById(id);
        if (repair == null) throw new BusinessException("维修记录不存在");
        if (!"repairing".equals(repair.getStatus())) throw new BusinessException("仅允许删除维修中的记录");

        repairMapper.deleteById(id);

        // 检查该资产是否还有其他维修中的记录，没有则恢复资产状态为闲置并显式解除持有关系
        Long remainingCount = repairMapper.selectCount(
                new LambdaQueryWrapper<EamRepair>()
                        .eq(EamRepair::getAssetId, repair.getAssetId())
                        .eq(EamRepair::getStatus, "repairing"));
        if (remainingCount == 0) {
            EamAsset asset = assetMapper.selectOne(
                    new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, repair.getAssetId()).last("FOR UPDATE"));
            if (asset != null && "in_repair".equals(asset.getStatus())) {
                lifecycleService.releaseAssetToStatus(asset, "idle", null, null);
            }
        }

        log.info("删除维修记录：{} (id={})", repair.getAssetNo(), id);
    }

    private EamRepairVO toVO(EamRepair repair) {
        EamRepairVO vo = new EamRepairVO();
        BeanUtils.copyProperties(repair, vo, "createdAt", "updatedAt");
        vo.setCreatedAt(DateTimeUtils.format(repair.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(repair.getUpdatedAt()));
        // 填充所属品牌
        EamAsset asset = assetMapper.selectById(repair.getAssetId());
        if (asset != null) {
            vo.setCompanyBrand(asset.getCompanyBrand());
            vo.setBrand(asset.getBrand());
        }
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long createFromDispose(long returnId) {
        EamReturn ret = returnMapper.selectById(returnId);
        if (ret == null) throw new BusinessException("歸還記錄不存在");

        // 幂等：已有 repairId 则直接返回
        if (ret.getRepairId() != null) {
            log.info("归还记录 {} 已关联维修记录 {}，跳过自动创建", returnId, ret.getRepairId());
            return ret.getRepairId();
        }

        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, ret.getAssetId()).last("FOR UPDATE"));
        if (asset == null) throw new BusinessException("關聯資產不存在 assetId=" + ret.getAssetId());

        // 构建维修记录
        EamRepair repair = new EamRepair();
        repair.setAssetId(asset.getId());
        repair.setAssetNo(asset.getAssetNo());
        repair.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
        repair.setRepairDate(ret.getDispositionDate() != null ? ret.getDispositionDate().toString() : ret.getReturnDate().toString());
        // 故障描述：使用归还异常原因
        String faultDesc = StringUtils.hasText(ret.getExceptionReason())
                ? ret.getExceptionReason()
                : "歸還時資產損壞（來源歸還單 " + ret.getReturnNo() + "）";
        repair.setFaultDesc(faultDesc);
        repair.setRepairContent("待維修人員補充");
        repair.setRepairBy(""); // 待后续维修管理中补充
        repair.setCost(java.math.BigDecimal.ZERO);
        repair.setStatus("repairing");
        repair.setApplicant(operatorResolver.currentOperatorName());
        repair.setReturnId(returnId);
        // 责任快照取归还单持有人（损坏归还时台账持有关系已由 register 解除）
        repair.setOriginalHolderId(ret.getEmployeeId());
        repair.setHoldType(asset.getHoldType());
        repair.setCreatedBy(operatorResolver.currentOperatorName());
        repair.setUpdatedBy(operatorResolver.currentOperatorName());
        repairMapper.insert(repair);

        // 资产置为维修中（来源已在归还时结束，不重复关闭）
        lifecycleService.recordEvent(asset, "repair", repair.getId(),
                new EamAssetLifecycleService.ClosedSource(null, null, ret.getEmployeeId(), null, asset.getDepartment()),
                "in_repair", asset.getDepartment(),
                ret.getDispositionDate() != null ? ret.getDispositionDate() : ret.getReturnDate(), null);
        lifecycleService.releaseAssetToStatus(asset, "in_repair", null, null);

        // 回写归还记录的 repairId
        ret.setRepairId(repair.getId());
        returnMapper.updateById(ret);

        log.info("处置流程自动创建维修记录 repairId={}, assetId={}, returnId={}", repair.getId(), asset.getId(), returnId);
        return repair.getId();
    }

    /** 解析 yyyy-MM-dd 业务日期，无效或缺失时回退今日 */
    private LocalDate parseDateOrToday(String value) {
        if (!StringUtils.hasText(value)) return LocalDate.now();
        try {
            return LocalDate.parse(value.trim());
        } catch (RuntimeException e) {
            return LocalDate.now();
        }
    }
}
