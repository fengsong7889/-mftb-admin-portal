package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamAssetStateEvent;
import com.mftb.admin.entity.EamBorrow;
import com.mftb.admin.entity.EamClaim;
import com.mftb.admin.entity.EamLocation;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamAssetStateEventMapper;
import com.mftb.admin.mapper.EamBorrowMapper;
import com.mftb.admin.mapper.EamClaimMapper;
import com.mftb.admin.mapper.EamLocationMapper;
import com.mftb.admin.service.EamAssetLifecycleService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/**
 * 资产持有关系生命周期服务实现。
 * <p>依赖仅到 Mapper 层，无跨服务循环依赖；所有写操作加入调用方事务。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamAssetLifecycleServiceImpl implements EamAssetLifecycleService {

    private final EamAssetMapper assetMapper;
    private final EamClaimMapper claimMapper;
    private final EamBorrowMapper borrowMapper;
    private final EamLocationMapper locationMapper;
    private final EamAssetStateEventMapper stateEventMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public ClosedSource closeActiveSource(EamAsset asset, String closeType, Long closeBizId, String reason) {
        String closedStatus = closeStatusFor(closeType);
        String operator = operatorResolver.currentOperatorName();
        LocalDateTime now = LocalDateTime.now();

        // 优先关闭活跃领用
        if (asset.getActiveClaimId() != null) {
            EamClaim claim = claimMapper.selectForUpdate(asset.getActiveClaimId());
            if (claim != null && "claimed".equals(claim.getStatus())) {
                // 与持有人一致性校验：台账持有人须与领用人一致，否则数据异常要求人工核对
                if (asset.getCurrentHolderId() != null && !Objects.equals(asset.getCurrentHolderId(), claim.getEmployeeId())) {
                    throw new BusinessException("領用來源與持有人不一致，請先核對領用關係");
                }
                claimMapper.update(null, new UpdateWrapper<EamClaim>()
                        .eq("id", claim.getId())
                        .set("status", closedStatus)
                        .set("closed_at", now)
                        .set("close_type", closeType)
                        .set("close_biz_id", closeBizId)
                        .set("close_reason", reason)
                        .set("updated_by", operator));
                return new ClosedSource("claim", claim.getId(), claim.getEmployeeId(),
                        asset.getUserName(), asset.getDepartment());
            }
        }

        // 领用为空 → 关闭活跃借用
        List<EamBorrow> activeBorrows = borrowMapper.selectList(new LambdaQueryWrapper<EamBorrow>()
                .eq(EamBorrow::getAssetId, asset.getId())
                .in(EamBorrow::getStatus, "active", "overdue"));
        if (activeBorrows.isEmpty()) {
            return ClosedSource.none();
        }
        if (activeBorrows.size() > 1) {
            throw new BusinessException("同一資產存在多條有效借用，請先核對借用記錄");
        }
        EamBorrow borrow = borrowMapper.selectForUpdate(activeBorrows.get(0).getId());
        if (borrow != null && ("active".equals(borrow.getStatus()) || "overdue".equals(borrow.getStatus()))) {
            borrowMapper.update(null, new UpdateWrapper<EamBorrow>()
                    .eq("id", borrow.getId())
                    .set("status", closedStatus)
                    .set("closed_at", now)
                    .set("close_type", closeType)
                    .set("close_biz_id", closeBizId)
                    .set("close_reason", reason)
                    .set("updated_by", operator));
            return new ClosedSource("borrow", borrow.getId(), borrow.getHolderId(),
                    borrow.getHolderName(), borrow.getDepartment());
        }
        return ClosedSource.none();
    }

    @Override
    public void releaseAssetToStatus(EamAsset asset, String newStatus, String receiveDepartment, Long receiveLocationId) {
        String operator = operatorResolver.currentOperatorName();
        asset.setStatus(newStatus);
        asset.setUpdatedBy(operator);
        // 可选接收部门/位置（有实物交接时更新归属，否则保持原值）
        if (StringUtils.hasText(receiveDepartment)) {
            asset.setDepartment(receiveDepartment.trim());
        }
        Long locationId = null;
        String locationName = null;
        if (receiveLocationId != null && receiveLocationId > 0) {
            EamLocation location = locationMapper.selectById(receiveLocationId);
            if (location != null) {
                locationId = location.getId();
                locationName = location.getName();
            } else {
                log.warn("释放资产归位失败：存放位置不存在 locationId={}，保持原位置 {}", receiveLocationId, asset.getLocation());
            }
        }
        UpdateWrapper<EamAsset> update = new UpdateWrapper<EamAsset>()
                .eq("id", asset.getId())
                .set("status", newStatus)
                .set("current_holder_id", null)
                .set("user_name", null)
                .set("active_claim_id", null)
                .set("usage_date", null);
        if (asset.getDepartment() != null) {
            update.set("department", asset.getDepartment());
        }
        if (locationId != null) {
            update.set("location_id", locationId).set("location", locationName);
        }
        // 传入实体触发 hold_version 数据库端自增（@TableField update="%s+1" ALWAYS）
        int rows = assetMapper.update(asset, update);
        if (rows != 1) {
            throw new BusinessException("資產持有關係已變更，請刷新後重試");
        }
    }

    @Override
    public void recordEvent(EamAsset asset, String bizType, Long bizId, ClosedSource source,
                            String afterStatus, String afterDepartment, LocalDate bizDate, String requestKey) {
        EamAssetStateEvent event = new EamAssetStateEvent();
        event.setAssetId(asset.getId());
        event.setBizType(bizType);
        event.setBizId(bizId);
        if (source != null) {
            event.setSourceType(source.sourceType());
            event.setSourceId(source.sourceId());
        }
        event.setBeforeStatus(asset.getStatus());
        event.setAfterStatus(afterStatus);
        event.setBeforeHolderId(asset.getCurrentHolderId());
        event.setBeforeHolderName(asset.getUserName());
        event.setBeforeDepartment(asset.getDepartment());
        event.setAfterDepartment(StringUtils.hasText(afterDepartment) ? afterDepartment : asset.getDepartment());
        var current = operatorResolver.currentUser();
        event.setOperatorId(current != null ? current.getId() : null);
        event.setOperatorName(operatorResolver.currentOperatorName());
        event.setBizDate(bizDate);
        event.setRequestKey(StringUtils.hasText(requestKey) ? requestKey : null);
        stateEventMapper.insert(event);
    }

    @Override
    public Long findBizIdByRequestKey(Long operatorId, String requestKey) {
        if (operatorId == null || !StringUtils.hasText(requestKey)) {
            return null;
        }
        EamAssetStateEvent existing = stateEventMapper.selectByRequestKey(operatorId, requestKey);
        return existing != null ? existing.getBizId() : null;
    }

    /** 终止来源类型 → 来源记录终态 */
    private String closeStatusFor(String closeType) {
        return switch (closeType) {
            case CLOSE_LOSS -> CLAIM_LOSS_CLOSED;
            case CLOSE_SCRAP -> CLAIM_SCRAP_CLOSED;
            case CLOSE_REPAIR -> CLAIM_REPAIR_CLOSED;
            default -> throw new BusinessException("未知的终止来源类型: " + closeType);
        };
    }
}
