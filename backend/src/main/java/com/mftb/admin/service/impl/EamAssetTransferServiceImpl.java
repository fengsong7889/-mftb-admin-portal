package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamClaim;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.mapper.EamClaimMapper;
import com.mftb.admin.service.EamAssetService;
import com.mftb.admin.service.EamTransferLookup;
import com.mftb.admin.service.EamTransferRules;
import static com.mftb.admin.service.EamTransferRules.*;
import com.mftb.admin.util.JsonUtils;
import org.springframework.util.DigestUtils;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import com.mftb.admin.entity.EamAssetTransfer;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamAssetTransferMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EamAssetTransferService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * 资产调拨服务实现
 * <p>
 * 登记流程：锁定资产 → 校验 in_use → 解析新使用人（工号优先/姓名回退）
 * → 生成调拨单（DB+YYYYMMDD+4位）→ 落单快照 from/to → 更新资产归属
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EamAssetTransferServiceImpl implements EamAssetTransferService {

    private final EamAssetTransferMapper transferMapper;
    private final EamAssetMapper assetMapper;
    private final SysUserMapper userMapper;
    private final EamClaimMapper claimMapper;
    private final EamAssetService assetService;
    private final EamTransferLookup lookup;
    private final EamTransferRules rules;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<EamAssetTransferVO> page(EamAssetTransferQuery query) {
        Page<EamAssetTransfer> page = transferMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                queryWrapper(query).orderByDesc(EamAssetTransfer::getCreatedAt, EamAssetTransfer::getId));
        return new PageResult<>(
                page.getRecords().stream().map(this::toVO).toList(),
                page.getTotal());
    }

    @Override
    public PageResult<EamAssetVO> candidates(EamAssetQuery query) {
        query.setStatus(IN_USE);
        PageResult<EamAssetVO> result = assetService.page(query);
        result.getRecords().forEach(this::enrichCandidate);
        return result;
    }

    @Override
    public EamAssetVO candidate(long id) {
        EamAssetVO result = assetService.detail(id);
        enrichCandidate(result);
        return result;
    }

    private void enrichCandidate(EamAssetVO vo) {
        EamAsset asset = new EamAsset();
        BeanUtils.copyProperties(vo, asset);
        EamClaim claim = vo.getActiveClaimId() == null ? null : claimMapper.selectById(vo.getActiveClaimId());
        String blocked = rules.blocked(asset, claim);
        vo.setTransferable(blocked == null);
        vo.setTransferBlockedReason(blocked);
        vo.setClaimDate(claim == null || BORROWED.equals(vo.getHoldType()) ? null : DateTimeUtils.format(claim.getClaimDate()));
    }

    @Override
    public EamAssetTransferVO detail(long id) {
        return toVO(requireTransfer(id));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long register(EamAssetTransferSaveDTO dto) {
        if (dto.getAssetId() == null || dto.getToUserId() == null || dto.getToDepartmentId() == null)
            throw new BusinessException("請選擇資產、接收人及調入部門");
        checkText(dto.getReason(), REASON_LIMIT, true, "調撥原因");
        checkText(dto.getRemark(), REMARK_LIMIT, false, "備註");
        if (dto.getExpectedVersion() == null || dto.getExpectedVersion() < 0 || dto.getRequestKey() == null
                || !dto.getRequestKey().matches("[a-zA-Z0-9-]{16,64}")) throw new BusinessException("請刷新頁面後重新提交");
        SysUser operator = operatorResolver.currentUser();
        if (operator == null) throw new BusinessException("請先登入");
        LocalDate date = parseDate(dto.getTransferDate());
        if (date.isAfter(LocalDate.now())) throw new BusinessException("調撥日期不可晚於今日");
        String hash = DigestUtils.md5DigestAsHex(JsonUtils.toJson(dto).getBytes(StandardCharsets.UTF_8));
        EamAssetTransfer existing = requestRecord(operator.getId(), dto.getRequestKey(), false);
        if (existing != null) return replay(existing, hash);

        // 与归还、签署保持相同顺序：来源领用 → 资产 → 调拨，锁后再次验证。
        EamAsset observed = assetMapper.selectById(dto.getAssetId());
        if (observed == null) throw new BusinessException("資產不存在");
        EamClaim source = observed.getActiveClaimId() == null ? null : claimMapper.selectForUpdate(observed.getActiveClaimId());
        EamAsset asset = assetMapper.selectOne(new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, dto.getAssetId()).last("FOR UPDATE"));
        existing = requestRecord(operator.getId(), dto.getRequestKey(), true);
        if (existing != null) return replay(existing, hash);
        String blocked = rules.blocked(asset, source);
        if (blocked != null) throw new BusinessException(blocked);
        if (!Objects.equals(dto.getExpectedVersion(), asset.getHoldVersion())) throw new BusinessException("資產已被其他人更新，請刷新後重試");
        if (date.isBefore(source.getClaimDate())) throw new BusinessException("調撥日期不可早於領用日期");
        EamAssetTransfer latest = latest(asset.getId());
        if (latest != null && date.isBefore(latest.getTransferDate())) throw new BusinessException("調撥日期不可早於上次調撥日期");
        SysDepartment department = lookup.requireDepartment(dto.getToDepartmentId());
        SysUser toUser = userMapper.selectById(dto.getToUserId());
        if (toUser == null || !Objects.equals(toUser.getStatus(), EamTransferLookup.ENABLED)) throw new BusinessException("接收人不存在或已停用");
        String userName = toUser.getName() != null ? toUser.getName() : toUser.getUsername();
        if ((hasText(dto.getToUserEmpId()) && !Objects.equals(dto.getToUserEmpId().trim(), toUser.getEmpId()))
                || (hasText(dto.getToUserName()) && !Objects.equals(dto.getToUserName().trim(), userName)))
            throw new BusinessException("接收人姓名或工號不匹配，請重新選擇");
        if (Objects.equals(toUser.getId(), asset.getCurrentHolderId()) && Objects.equals(department.getName(), asset.getDepartment()))
            throw new BusinessException("使用人及部門均未改變，無需調撥");
        SysUser fromUser = userMapper.selectById(asset.getCurrentHolderId());
        if (fromUser == null) throw new BusinessException("原持有人不存在，請先核對領用關係");
        String actor = operatorResolver.currentOperatorName();
        EamAssetTransfer transfer = new EamAssetTransfer();
        transfer.setTransferNo(bizSeqService.next(BizSeqService.RULE_EAM_TRANSFER));
        transfer.setAssetId(asset.getId()); transfer.setAssetNo(asset.getAssetNo()); transfer.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
        transfer.setBrandId(asset.getBrandId()); transfer.setBrand(asset.getBrand()); transfer.setBrandBackfilled(0);
        transfer.setFromUserId(asset.getCurrentHolderId()); transfer.setFromUserName(asset.getUserName());
        transfer.setFromUserEmpId(fromUser.getEmpId()); transfer.setFromDepartment(Objects.toString(asset.getDepartment(), ""));
        transfer.setFromDepartmentId(lookup.uniqueDepartmentId(asset.getDepartment()));
        transfer.setToUserId(toUser.getId()); transfer.setToUserName(userName); transfer.setToUserEmpId(toUser.getEmpId());
        transfer.setToDepartmentId(department.getId()); transfer.setToDepartment(department.getName());
        transfer.setFromClaimId(source.getId()); transfer.setFromUsageDate(asset.getUsageDate());
        transfer.setTransferDate(date); transfer.setReason(dto.getReason().trim()); transfer.setRemark(trim(dto.getRemark()));
        transfer.setStatus(DONE); transfer.setOperatorId(operator.getId()); transfer.setOperatorName(actor);
        transfer.setCreatedBy(actor); transfer.setUpdatedBy(actor);
        transfer.setRequestKey(dto.getRequestKey()); transfer.setRequestHash(hash);
        transfer.setAppliedVersion(asset.getHoldVersion() + 1);
        if (transferMapper.insert(transfer) != 1) throw new BusinessException("調撥建立失敗");

        EamClaim successor = new EamClaim();
        successor.setClaimNo(bizSeqService.next(BizSeqService.RULE_EAM_CLAIM));
        successor.setAssetId(asset.getId()); successor.setEmployeeId(toUser.getId());
        successor.setOperatorId(operator.getId()); successor.setOperatorName(actor);
        successor.setClaimDate(date); successor.setClaimReason(dto.getReason().trim());
        successor.setStatus(CLAIMED); successor.setSignatureStatus(PROXY_PENDING); successor.setProxyMode(1);
        successor.setProxyReason("調撥承接：" + transfer.getTransferNo());
        successor.setSourceTransferId(transfer.getId()); successor.setPreviousClaimId(source.getId());
        successor.setCreatedBy(actor); successor.setUpdatedBy(actor);
        if (claimMapper.insert(successor) != 1) throw new BusinessException("承接領用建立失敗");
        source.setStatus(TRANSFERRED); source.setUpdatedBy(actor);
        if (claimMapper.updateById(source) != 1) throw new BusinessException("原領用狀態已變更");
        transfer.setToClaimId(successor.getId());
        if (transferMapper.updateById(transfer) != 1) throw new BusinessException("調撥狀態已變更");
        updateHolder(asset, toUser.getId(), userName, department.getName(), successor.getId(), date.toString());
        return transfer.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long id, String reason) {
        checkText(reason, REASON_LIMIT, true, "撤銷原因");
        EamAssetTransfer observed = requireTransfer(id);
        if (observed.getFromClaimId() == null || observed.getToClaimId() == null)
            throw new BusinessException("歷史調撥缺少責任快照，請人工核查，不可直接撤銷");
        Map<Long, EamClaim> locked = new HashMap<>();
        for (Long claimId : new TreeSet<>(List.of(observed.getFromClaimId(), observed.getToClaimId())))
            locked.put(claimId, claimMapper.selectForUpdate(claimId));
        EamAsset asset = assetMapper.selectOne(new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, observed.getAssetId()).last("FOR UPDATE"));
        EamAssetTransfer transfer = transferMapper.selectForUpdate(id);
        EamClaim source = locked.get(observed.getFromClaimId()), successor = locked.get(observed.getToClaimId());
        String blocked = cancelBlocked(transfer, asset, source, successor);
        if (blocked != null) throw new BusinessException(blocked);
        source.setStatus(CLAIMED); source.setUpdatedBy(operatorResolver.currentOperatorName());
        successor.setStatus(CANCELLED); successor.setCancelledReason(reason.trim());
        successor.setSignatureStatus("not_required"); successor.setUpdatedBy(operatorResolver.currentOperatorName());
        if (claimMapper.updateById(source) != 1 || claimMapper.updateById(successor) != 1) throw new BusinessException("領用狀態已變更");
        updateHolder(asset, transfer.getFromUserId(), transfer.getFromUserName(), transfer.getFromDepartment(), source.getId(), transfer.getFromUsageDate());
        transfer.setStatus(CANCELLED); transfer.setCancelReason(reason.trim());
        transfer.setCancelledBy(operatorResolver.currentOperatorName()); transfer.setCancelledAt(LocalDateTime.now());
        transfer.setUpdatedBy(operatorResolver.currentOperatorName());
        if (transferMapper.updateById(transfer) != 1) throw new BusinessException("調撥狀態已變更");
    }

    // ─────────── 私有方法 ───────────

    private EamAssetTransfer requireTransfer(long id) {
        EamAssetTransfer t = transferMapper.selectById(id);
        if (t == null) throw new BusinessException("調撥記錄不存在");
        return t;
    }

    private void updateHolder(EamAsset asset, Long userId, String name, String department, Long claimId, String usageDate) {
        EamAsset patch = new EamAsset();
        patch.setUpdatedBy(operatorResolver.currentOperatorName());
        if (assetMapper.update(patch, new UpdateWrapper<EamAsset>().eq("id", asset.getId()).eq("hold_version", asset.getHoldVersion())
                .set("current_holder_id", userId).set("user_name", name).set("department", department)
                .set("active_claim_id", claimId).set("usage_date", usageDate)) != 1)
            throw new BusinessException("資產已被其他人更新，請刷新後重試");
    }

    private EamAssetTransfer requestRecord(Long operatorId, String key, boolean lock) {
        LambdaQueryWrapper<EamAssetTransfer> q = new LambdaQueryWrapper<EamAssetTransfer>()
                .eq(EamAssetTransfer::getOperatorId, operatorId).eq(EamAssetTransfer::getRequestKey, key);
        if (lock) q.last("FOR UPDATE");
        return transferMapper.selectOne(q);
    }

    private long replay(EamAssetTransfer existing, String hash) {
        if (!Objects.equals(hash, existing.getRequestHash())) throw new BusinessException("請求編號已使用，請刷新後重新提交");
        return existing.getId();
    }

    private EamAssetTransfer latest(Long assetId) {
        return transferMapper.selectOne(new LambdaQueryWrapper<EamAssetTransfer>()
                .eq(EamAssetTransfer::getAssetId, assetId).eq(EamAssetTransfer::getStatus, DONE)
                .orderByDesc(EamAssetTransfer::getId).last("LIMIT 1"));
    }

    private String cancelBlocked(EamAssetTransfer t, EamAsset a, EamClaim from, EamClaim to) {
        if (t == null || !DONE.equals(t.getStatus())) return "僅已完成調撥可撤銷";
        if (t.getAppliedVersion() == null || from == null || to == null || t.getFromUserId() == null) return "歷史調撥缺少責任快照，請人工核查";
        if (a == null || !Objects.equals(a.getHoldVersion(), t.getAppliedVersion())
                || !Objects.equals(a.getCurrentHolderId(), t.getToUserId()) || !Objects.equals(a.getDepartment(), t.getToDepartment())
                || !Objects.equals(a.getActiveClaimId(), t.getToClaimId()) || !IN_USE.equals(a.getStatus())) return "資產已有後續業務變更，不可撤銷";
        if (!TRANSFERRED.equals(from.getStatus()) || !CLAIMED.equals(to.getStatus())
                || !PROXY_PENDING.equals(to.getSignatureStatus())) return "領用已變更或接收人已簽收，不可撤銷";
        EamAssetTransfer last = latest(t.getAssetId());
        if (last == null || !Objects.equals(last.getId(), t.getId())) return "只可撤銷最新調撥";
        if (userMapper.selectById(t.getFromUserId()) == null) return "原持有人不存在，請人工核查";
        return rules.blocked(a, to);
    }

    private void checkText(String value, int max, boolean required, String label) {
        if (required && !hasText(value)) throw new BusinessException(label + "不能為空");
        if (value != null && value.length() > max) throw new BusinessException(label + "最多 " + max + " 字元");
    }

    private String trim(String value) { return value == null ? null : value.trim(); }

    private EamAssetTransferVO toVO(EamAssetTransfer t) {
        EamAssetTransferVO vo = new EamAssetTransferVO();
        BeanUtils.copyProperties(t, vo, "transferDate", "createdAt", "updatedAt", "cancelledAt");
        vo.setCancelledAt(DateTimeUtils.format(t.getCancelledAt()));
        EamAsset asset = assetMapper.selectById(t.getAssetId());
        if (asset != null) {
            vo.setParams(JsonUtils.parseMap(asset.getParams()));
            vo.setCategoryCode(asset.getCategoryCode());
        }
        String blocked = cancelBlocked(t, asset,
                t.getFromClaimId() == null ? null : claimMapper.selectById(t.getFromClaimId()),
                t.getToClaimId() == null ? null : claimMapper.selectById(t.getToClaimId()));
        vo.setCancellable(blocked == null);
        vo.setCancelBlockedReason(blocked);
        vo.setTransferDate(DateTimeUtils.format(t.getTransferDate()));
        vo.setCreatedAt(DateTimeUtils.format(t.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(t.getUpdatedAt()));
        return vo;
    }

    private LambdaQueryWrapper<EamAssetTransfer> queryWrapper(EamAssetTransferQuery q) {
        LambdaQueryWrapper<EamAssetTransfer> w = new LambdaQueryWrapper<>();
        w.eq(q.getBrandId() != null, EamAssetTransfer::getBrandId, q.getBrandId());
        if (q.getFromDepartmentId() != null) {
            Set<Long> ids = lookup.departmentIds(q.getFromDepartmentId());
            List<String> names = lookup.departmentNames(q.getFromDepartmentId());
            w.and(x -> {
                x.in(EamAssetTransfer::getFromDepartmentId, ids);
                if (!names.isEmpty()) x.or(y -> y.isNull(EamAssetTransfer::getFromDepartmentId).in(EamAssetTransfer::getFromDepartment, names));
            });
        }
        if (q.getToDepartmentId() != null) {
            Set<Long> ids = lookup.departmentIds(q.getToDepartmentId());
            List<String> names = lookup.departmentNames(q.getToDepartmentId());
            w.and(x -> {
                x.in(EamAssetTransfer::getToDepartmentId, ids);
                if (!names.isEmpty()) x.or(y -> y.isNull(EamAssetTransfer::getToDepartmentId).in(EamAssetTransfer::getToDepartment, names));
            });
        }
        if (hasText(q.getStatus()) && !Set.of(DONE, CANCELLED).contains(q.getStatus())) throw new BusinessException("無效的調撥狀態");
        if (hasText(q.getTransferNo())) {
            w.like(EamAssetTransfer::getTransferNo, q.getTransferNo().trim());
        }
        if (hasText(q.getAssetNo())) {
            w.like(EamAssetTransfer::getAssetNo, q.getAssetNo().trim());
        }
        if (hasText(q.getAssetName())) {
            w.like(EamAssetTransfer::getAssetName, q.getAssetName().trim());
        }
        if (hasText(q.getFromUserName())) {
            w.like(EamAssetTransfer::getFromUserName, q.getFromUserName().trim());
        }
        if (hasText(q.getToUserName())) {
            w.like(EamAssetTransfer::getToUserName, q.getToUserName().trim());
        }
        if (hasText(q.getFromDepartment())) {
            w.like(EamAssetTransfer::getFromDepartment, q.getFromDepartment().trim());
        }
        if (hasText(q.getToDepartment())) {
            w.like(EamAssetTransfer::getToDepartment, q.getToDepartment().trim());
        }
        if (hasText(q.getStatus())) {
            w.eq(EamAssetTransfer::getStatus, q.getStatus().trim());
        }
        if (hasText(q.getOperatorName())) {
            w.like(EamAssetTransfer::getOperatorName, q.getOperatorName().trim());
        }
        LocalDate dateStart = parseDateOrNull(q.getStartDate());
        if (dateStart != null) w.ge(EamAssetTransfer::getTransferDate, dateStart);
        LocalDate dateEnd = parseDateOrNull(q.getEndDate());
        if (dateStart != null && dateEnd != null && dateStart.isAfter(dateEnd)) throw new BusinessException("開始日期不可晚於結束日期");
        if (dateEnd != null) w.le(EamAssetTransfer::getTransferDate, dateEnd);
        return w;
    }

    private boolean hasText(String text) {
        return text != null && !text.isBlank();
    }

    private LocalDate parseDateOrNull(String value) {
        if (!hasText(value)) return null;
        try {
            return LocalDate.parse(value.trim());
        } catch (RuntimeException e) {
            throw new BusinessException("日期格式應為 yyyy-MM-dd");
        }
    }

    private LocalDate parseDate(String value) {
        if (!hasText(value)) throw new BusinessException("調撥日期不能為空");
        try {
            return LocalDate.parse(value.trim());
        } catch (RuntimeException e) {
            throw new BusinessException("日期格式應為 yyyy-MM-dd");
        }
    }
}
