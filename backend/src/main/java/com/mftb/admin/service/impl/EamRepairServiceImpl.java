package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamRepairSaveDTO;
import com.mftb.admin.dto.EamRepairVO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamRepair;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamRepairMapper;
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

@Slf4j
@Service
@RequiredArgsConstructor
public class EamRepairServiceImpl implements EamRepairService {

    private final EamRepairMapper repairMapper;
    private final EamAssetMapper assetMapper;
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
        return records.stream().map(this::toVO).toList();
    }

    @Override
    public EamRepairVO detail(long id) {
        EamRepair repair = repairMapper.selectById(id);
        if (repair == null) throw new BusinessException("维修记录不存在");
        return toVO(repair);
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
        repair.setAssetName(asset.getAssetName());
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

    private EamRepairVO toVO(EamRepair repair) {
        EamRepairVO vo = new EamRepairVO();
        BeanUtils.copyProperties(repair, vo, "createdAt", "updatedAt");
        vo.setCreatedAt(DateTimeUtils.format(repair.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(repair.getUpdatedAt()));
        return vo;
    }
}
