package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.contracts.eam.EamAssetReclaimPort;
import com.mftb.admin.dto.EamHandoverSaveDTO;
import com.mftb.admin.dto.EamHandoverVO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.mapper.EamAssetMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Optional;

/**
 * 资产回收契约的 EAM 侧实现：HR 离职办理通过 {@link EamAssetReclaimPort} 调用。
 *
 * 行为与拆分前逐字一致：只交接「在当前持有人名下且状态为 use」的资产，
 * 原因仍为 resign，备注仍带离职单号，单号回读逻辑不变（优先交接单号，缺失时退回内部 id）。
 */
@Service
@RequiredArgsConstructor
public class EamAssetReclaimAdapter implements EamAssetReclaimPort {

    /** 资产「在 use 中」状态字面量（与 EamBorrowServiceImpl 写入值同源） */
    private static final String ASSET_STATUS_IN_USE = "use";

    private final EamAssetMapper assetMapper;
    private final EamHandoverService handoverService;

    @Override
    public Optional<HandoverResult> handoverInUseAssets(Long employeeUserId, ResignationHandoverCommand command) {
        List<EamAsset> assets = assetMapper.selectList(new LambdaQueryWrapper<EamAsset>()
                .eq(EamAsset::getCurrentHolderId, employeeUserId)
                .eq(EamAsset::getStatus, ASSET_STATUS_IN_USE));
        if (assets.isEmpty()) {
            return Optional.empty();
        }
        List<Long> assetIds = assets.stream().map(EamAsset::getId).toList();

        EamHandoverSaveDTO dto = new EamHandoverSaveDTO();
        dto.setFromUserName(command.fromUserName());
        dto.setFromDepartment(command.fromDepartment());
        dto.setToUserName(command.toUserName());
        dto.setToDepartment(command.toDepartment());
        dto.setReceiverType(command.receiverType());
        dto.setHandoverDate(command.handoverDate());
        dto.setAssetIds(assetIds);
        dto.setReason(command.reason());
        dto.setOperatorName(command.operatorName());
        dto.setRemark(command.remark());
        long handoverId = handoverService.register(dto);

        // 回读业务单号：targetRef 存单号而不是内部 id，人事侧的人看得懂
        String handoverNo = String.valueOf(handoverId);
        EamHandoverVO detail = handoverService.detail(handoverId);
        if (detail != null && StringUtils.hasText(detail.getHandoverNo())) {
            handoverNo = detail.getHandoverNo();
        }
        return Optional.of(new HandoverResult(assetIds.size(), handoverNo));
    }
}
