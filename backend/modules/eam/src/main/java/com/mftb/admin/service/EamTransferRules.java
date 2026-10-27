package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.util.Objects;

/** 调拨资格在展示和事务提交时共用；展示结果不代替锁内校验。 */
@Service
@RequiredArgsConstructor
public class EamTransferRules {
    public static final String IN_USE = "in_use", OWNED = "owned", BORROWED = "borrowed";
    public static final String DONE = "done", CANCELLED = "cancelled", CLAIMED = "claimed", TRANSFERRED = "transferred";
    public static final String PROXY_PENDING = "proxy_pending";
    public static final int REASON_LIMIT = 500, REMARK_LIMIT = 512;
    private final EamBorrowMapper borrowMapper;
    private final EamReturnMapper returnMapper;

    public String blocked(EamAsset asset, EamClaim claim) {
        if (asset == null) return "資產不存在";
        if (!IN_USE.equals(asset.getStatus())) return "僅使用中資產可調撥";
        if (BORROWED.equals(asset.getHoldType())) return "借用資產須先歸還，再由接收人重新借用";
        if (!OWNED.equals(asset.getHoldType())) return "持有方式不明，請先核對台賬";
        if (claim == null || !CLAIMED.equals(claim.getStatus()) || asset.getCurrentHolderId() == null
                || !Objects.equals(asset.getActiveClaimId(), claim.getId())
                || !Objects.equals(asset.getId(), claim.getAssetId())
                || !Objects.equals(asset.getCurrentHolderId(), claim.getEmployeeId())) return "領用來源與持有人不一致，請先核對領用關係";
        if (claim.getClaimDate() == null) return "領用日期缺失，請先核對領用記錄";
        if (borrowMapper.selectCount(new LambdaQueryWrapper<EamBorrow>().eq(EamBorrow::getAssetId, asset.getId())
                .in(EamBorrow::getStatus, "active", "overdue")) > 0) return "存在未結借用，請先歸還";
        if (returnMapper.selectCount(new LambdaQueryWrapper<EamReturn>().eq(EamReturn::getAssetId, asset.getId())
                .eq(EamReturn::getReturnStatus, "exception_pending")) > 0) return "存在待處置歸還，不可調撥";
        return null;
    }
}
