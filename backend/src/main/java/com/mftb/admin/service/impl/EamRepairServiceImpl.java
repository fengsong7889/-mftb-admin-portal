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
import com.mftb.admin.service.EamRepairService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamRepairServiceImpl implements EamRepairService {

    private final EamRepairMapper repairMapper;
    private final EamAssetMapper assetMapper;
    private final EamReturnMapper returnMapper;
    private final OperatorResolver operatorResolver;

    private static final List<String> VALID_STATUSES = List.of("repairing", "done");

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

        // 验证资产存在
        EamAsset asset = assetMapper.selectById(dto.getAssetId());
        if (asset == null) throw new BusinessException("资产不存在");

        EamRepair repair = new EamRepair();
        BeanUtils.copyProperties(dto, repair);
        repair.setAssetNo(asset.getAssetNo());
        repair.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
        repair.setStatus("repairing");
        repair.setCreatedBy(operatorResolver.currentOperatorName());
        repair.setUpdatedBy(operatorResolver.currentOperatorName());
        repairMapper.insert(repair);

        // 更新资产状态为维修中
        asset.setStatus("in_repair");
        asset.setUpdatedBy(operatorResolver.currentOperatorName());
        assetMapper.updateById(asset);

        log.info("创建维修记录：资产 {} ({}), 维修方 {}", asset.getAssetNo(), asset.getAssetName(), dto.getRepairBy());
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

        // 恢复资产状态为闲置
        EamAsset asset = assetMapper.selectById(repair.getAssetId());
        if (asset != null && "in_repair".equals(asset.getStatus())) {
            asset.setStatus("idle");
            asset.setUpdatedBy(operatorResolver.currentOperatorName());
            assetMapper.updateById(asset);
        }

        log.info("完成维修记录：{}，资产 {} 状态恢复为闲置", repair.getAssetNo(), repair.getAssetNo());
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

        // 检查该资产是否还有其他维修中的记录，没有则恢复资产状态为闲置
        Long remainingCount = repairMapper.selectCount(
                new LambdaQueryWrapper<EamRepair>()
                        .eq(EamRepair::getAssetId, repair.getAssetId())
                        .eq(EamRepair::getStatus, "repairing"));
        if (remainingCount == 0) {
            EamAsset asset = assetMapper.selectById(repair.getAssetId());
            if (asset != null && "in_repair".equals(asset.getStatus())) {
                asset.setStatus("idle");
                asset.setUpdatedBy(operatorResolver.currentOperatorName());
                assetMapper.updateById(asset);
            }
        }

        log.info("删除维修记录：{} (id={})", repair.getAssetNo(), id);
    }

    private EamRepairVO toVO(EamRepair repair) {
        EamRepairVO vo = new EamRepairVO();
        BeanUtils.copyProperties(repair, vo, "createdAt", "updatedAt");
        vo.setCreatedAt(DateTimeUtils.format(repair.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(repair.getUpdatedAt()));
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

        EamAsset asset = assetMapper.selectById(ret.getAssetId());
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
        repair.setCreatedBy(operatorResolver.currentOperatorName());
        repair.setUpdatedBy(operatorResolver.currentOperatorName());
        repairMapper.insert(repair);

        // 更新资产状态为维修中
        asset.setStatus("in_repair");
        asset.setUpdatedBy(operatorResolver.currentOperatorName());
        assetMapper.updateById(asset);

        // 回写归还记录的 repairId
        ret.setRepairId(repair.getId());
        returnMapper.updateById(ret);

        log.info("处置流程自动创建维修记录 repairId={}, assetId={}, returnId={}", repair.getId(), asset.getId(), returnId);
        return repair.getId();
    }
}
