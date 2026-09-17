package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.mftb.admin.service.EamReturnService;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamClaimService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamClaimServiceImpl implements EamClaimService {

    private final EamClaimMapper claimMapper;
    private final EamClaimEvidenceMapper evidenceMapper;
    private final EamReturnService returnService;
    private final EamClaimEventMapper eventMapper;
    private final EamAssetMapper assetMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    private static final Set<String> VALID_STATUSES = Set.of("pending_signature", "claimed", "returned", "cancelled", "transferred");

    /* ==================== 查询 ==================== */

    @Override
    public PageResult<EamClaimVO> page(EamClaimQuery query) {
        Page<EamClaim> page = claimMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                queryWrapper(query).orderByDesc(EamClaim::getCreatedAt, EamClaim::getId));
        List<EamClaimVO> records = page.getRecords().stream().map(this::toVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamClaimStatsVO stats(EamClaimQuery query) {
        EamClaimStatsVO stats = new EamClaimStatsVO();
        // 有领用记录的不同员工数（避免 selectCount + groupBy 导致 TooManyResultsException）
        List<Long> distinctEmpIds = claimMapper.selectList(
                statsWrapper(query).select(EamClaim::getEmployeeId).groupBy(EamClaim::getEmployeeId))
                .stream().map(EamClaim::getEmployeeId).toList();
        stats.setEmployeeCount((long) distinctEmpIds.size());
        // 各状态统计
        stats.setClaimedCount(claimMapper.selectCount(statsWrapper(query).eq(EamClaim::getStatus, "claimed")));
        stats.setReturnedCount(claimMapper.selectCount(statsWrapper(query).eq(EamClaim::getStatus, "returned")));
        // 待签记录（含代办补签）
        stats.setPendingSignatureCount(claimMapper.selectCount(
                statsWrapper(query).in(EamClaim::getStatus, "pending_signature", "claimed")
                        .in(EamClaim::getSignatureStatus, "pending", "proxy_pending")));
        return stats;
    }

    /**
     * 统计用查询条件：基础过滤 + 关键字（同時匹配员工姓名/工号）。
     * 每次调用返回全新 wrapper（mybatis-plus 3.5.7 的 Wrapper 不支持 copy()）。
     */
    private LambdaQueryWrapper<EamClaim> statsWrapper(EamClaimQuery query) {
        LambdaQueryWrapper<EamClaim> wrapper = queryWrapperNoKeyword(query);
        if (hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            List<SysUser> matchedUsers = userMapper.selectList(
                    new LambdaQueryWrapper<SysUser>()
                            .like(SysUser::getName, kw)
                            .or().like(SysUser::getEmpId, kw));
            List<Long> empIds = matchedUsers.stream().map(SysUser::getId).toList();
            wrapper.and(x -> {
                x.like(EamClaim::getClaimNo, kw)
                 .or().like(EamClaim::getOperatorName, kw);
                if (!empIds.isEmpty()) {
                    x.or().in(EamClaim::getEmployeeId, empIds);
                }
            });
        }
        return wrapper;
    }

    @Override
    public PageResult<EamClaimEmployeeSummaryVO> employeeSummary(EamClaimQuery query) {
        // 先查全部符合条件的领用记录（不在 SQL 層按關鍵字過濾，因為關鍵字需匹配員工姓名/工號/部門，在 Java 層處理）
        List<EamClaim> allClaims = claimMapper.selectList(queryWrapperNoKeyword(query));
        // 按 employee_id 分组
        Map<Long, List<EamClaim>> grouped = allClaims.stream()
                .collect(Collectors.groupingBy(EamClaim::getEmployeeId));

        List<EamClaimEmployeeSummaryVO> summaries = new ArrayList<>();
        for (Map.Entry<Long, List<EamClaim>> entry : grouped.entrySet()) {
            Long empId = entry.getKey();
            List<EamClaim> claims = entry.getValue();
            SysUser user = userMapper.selectById(empId);
            if (user == null) continue;

            EamClaimEmployeeSummaryVO vo = new EamClaimEmployeeSummaryVO();
            vo.setEmployeeId(empId);
            vo.setEmpNo(user.getEmpId());
            vo.setEmpName(user.getName() != null ? user.getName() : user.getUsername());
            vo.setDepartmentId(user.getDepartmentId());
            vo.setDepartment(user.getDepartment());
            vo.setClaimedCount(claims.stream().filter(c -> "claimed".equals(c.getStatus())).count());
            vo.setReturnedCount(claims.stream().filter(c -> "returned".equals(c.getStatus())).count());
            vo.setPendingCount(claims.stream().filter(c ->
                    "pending_signature".equals(c.getStatus()) && "pending".equals(c.getSignatureStatus())).count());
            // 代办领用落库为 status=claimed + signatureStatus=proxy_pending，故仅按 signatureStatus 判定
            vo.setProxyPendingCount(claims.stream().filter(c ->
                    "claimed".equals(c.getStatus()) && "proxy_pending".equals(c.getSignatureStatus())).count());
            vo.setLastClaimDate(claims.stream()
                    .map(c -> c.getClaimDate() != null ? c.getClaimDate().toString() : null)
                    .filter(Objects::nonNull)
                    .max(String::compareTo).orElse(null));
            summaries.add(vo);
        }
        // 按关键字过滤
        if (hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim().toLowerCase();
            summaries = summaries.stream()
                    .filter(s -> (s.getEmpName() != null && s.getEmpName().toLowerCase().contains(kw))
                            || (s.getEmpNo() != null && s.getEmpNo().toLowerCase().contains(kw))
                            || (s.getDepartment() != null && s.getDepartment().toLowerCase().contains(kw)))
                    .toList();
        }
        // 手动分页
        int total = summaries.size();
        int from = (int) PageResult.normalizeSize(query.getSize()) * ((int) PageResult.normalizePage(query.getPage()) - 1);
        int to = Math.min(from + (int) PageResult.normalizeSize(query.getSize()), total);
        return new PageResult<>(from < total ? summaries.subList(from, to) : List.of(), (long) total);
    }

    @Override
    public EamClaimVO detail(long claimId) {
        EamClaim claim = requireClaim(claimId);
        return toVO(claim);
    }

    @Override
    public List<EamClaimEventVO> events(long claimId) {
        return eventMapper.selectList(
                new LambdaQueryWrapper<EamClaimEvent>()
                        .eq(EamClaimEvent::getClaimId, claimId)
                        .orderByAsc(EamClaimEvent::getCreatedAt, EamClaimEvent::getId))
                .stream().map(this::toEventVO).toList();
    }

    @Override
    public PageResult<EamClaimVO> myClaims(EamClaimQuery query) {
        SysUser current = operatorResolver.currentUser();
        if (current == null) throw new BusinessException("未登录");
        query.setEmployeeId(current.getId());
        return page(query);
    }

    @Override
    public EamClaimVO myDetail(long id) {
        SysUser current = operatorResolver.currentUser();
        EamClaim claim = requireClaim(id);
        if (current == null || !Objects.equals(current.getId(), claim.getEmployeeId()))
            throw new BusinessException(403, "僅可查看本人領用");
        return toVO(claim);
    }

    /* ==================== 登记 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long register(EamClaimSaveDTO dto) {
        // 1. 校验资产
        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, dto.getAssetId()).last("FOR UPDATE"));
        if (asset == null) throw new BusinessException("資產不存在");
        if (asset.getActiveClaimId() != null) throw new BusinessException("該資產已有活躍領用，不可重複登記");

        // 2. 校验员工
        SysUser employee = userMapper.selectById(dto.getEmployeeId());
        if (employee == null) throw new BusinessException("領用人不存在");

        // 3. 校验日期
        LocalDate claimDate = parseDate(dto.getClaimDate());
        if (claimDate.isAfter(LocalDate.now())) throw new BusinessException("領用日期不可晚於今日");

        // 4. 代办权限
        boolean isProxy = "proxy".equals(dto.getMode());
        if (isProxy) {
            if (!hasText(dto.getProxyReason())) throw new BusinessException("代辦領用必須填寫代辦原因");
            SysUser operator = operatorResolver.currentUser();
            if (operator == null) throw new BusinessException("未登錄");
            if (!operatorResolver.isAdmin(operator)
                    && !operatorResolver.functionRoleCodes(operator).contains("admin")) {
                throw new BusinessException("僅管理員可代辦領用");
            }
        }

        // 5. 生成编号
        String claimNo = bizSeqService.next(BizSeqService.RULE_EAM_CLAIM);

        // 6. 创建领用记录
        EamClaim claim = new EamClaim();
        claim.setClaimNo(claimNo);
        claim.setAssetId(dto.getAssetId());
        claim.setEmployeeId(dto.getEmployeeId());
        claim.setOperatorId(operatorResolver.currentUser() != null ? operatorResolver.currentUser().getId() : null);
        claim.setOperatorName(operatorResolver.currentOperatorName());
        claim.setClaimDate(claimDate);
        claim.setClaimReason(dto.getClaimReason());
        claim.setRemark(dto.getRemark());
        claim.setProxyMode(isProxy ? 1 : 0);
        claim.setProxyReason(isProxy ? dto.getProxyReason() : null);
        claim.setCreatedBy(operatorResolver.currentOperatorName());
        claim.setUpdatedBy(operatorResolver.currentOperatorName());

        if (isProxy) {
            // 代办：立即生效，标记 proxy_pending
            claim.setStatus("claimed");
            claim.setSignatureStatus("proxy_pending");
        } else {
            // 标准：等待签署
            claim.setStatus("pending_signature");
            claim.setSignatureStatus("pending");
        }

        claimMapper.insert(claim);

        // 7. 更新资产持有人（代办立即生效）
        if (isProxy) {
            asset.setCurrentHolderId(dto.getEmployeeId());
            asset.setActiveClaimId(claim.getId());
            asset.setStatus("in_use");
            asset.setUserName(employee.getName() != null ? employee.getName() : employee.getUsername());
            // 回写领用日期，供资产台账「領用日期」列展示（此前遗漏导致恒为空 — BUG-08）
            asset.setUsageDate(claim.getClaimDate() != null ? claim.getClaimDate().toString() : null);
            assetMapper.updateById(asset);
        }

        // 8. 写事件
        insertEvent(claim.getId(), "created", claim.getOperatorName(),
                isProxy ? "管理員代辦領用" : "登記領用，等待簽署");

        return claim.getId();
    }

    /* ==================== 签署 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void sign(EamSignDTO dto) {
        EamClaim claim = claimMapper.selectForUpdate(dto.getClaimId());
        if (claim == null) throw new BusinessException("領用記錄不存在");
        boolean supplementary = "claimed".equals(claim.getStatus()) && "proxy_pending".equals(claim.getSignatureStatus());
        if (!"pending_signature".equals(claim.getStatus()) && !supplementary) throw new BusinessException("當前狀態不可簽署");
        SysUser signer = operatorResolver.currentUser();
        if (signer == null || !Objects.equals(signer.getId(), claim.getEmployeeId())) throw new BusinessException("僅領用人本人可簽署");
        EamAsset lockedAsset = assetMapper.selectOne(new LambdaQueryWrapper<EamAsset>()
                .eq(EamAsset::getId, claim.getAssetId()).last("FOR UPDATE"));
        if (lockedAsset == null) throw new BusinessException("資產不存在");
        if (supplementary) {
            if (!Objects.equals(lockedAsset.getActiveClaimId(), claim.getId())
                    || !Objects.equals(lockedAsset.getCurrentHolderId(), claim.getEmployeeId())
                    || !"in_use".equals(lockedAsset.getStatus())) throw new BusinessException("領用關係已變更，不可補簽");
        } else if (lockedAsset.getActiveClaimId() != null || !"idle".equals(lockedAsset.getStatus())) {
            throw new BusinessException("資產已被其他業務佔用，請刷新後重試");
        }
        if (!hasText(dto.getSignatureImage())) {
            throw new BusinessException("簽名圖片不能為空");
        }
        if (!dto.getSignatureImage().startsWith("data:image/png;base64,") || dto.getSignatureImage().length() > 2_000_000)
            throw new BusinessException("簽名必須為有效 PNG 圖片且小於 2MB");

        // 1. 保存签名凭证
        EamClaimEvidence evidence = new EamClaimEvidence();
        evidence.setClaimId(claim.getId());
        evidence.setEvidenceType("signature");
        evidence.setStoragePath(dto.getSignatureImage());
        evidence.setContentType("image/png");
        byte[] imageBytes = dto.getSignatureImage().getBytes(StandardCharsets.UTF_8);
        evidence.setFileSize(imageBytes.length);
        evidence.setContentHash(sha256(dto.getSignatureImage()));
        evidenceMapper.insert(evidence);

        // 2. 计算内容摘要
        String contentHash = sha256(
                claim.getClaimNo() + "|" + claim.getAssetId() + "|" + claim.getEmployeeId()
                        + "|" + claim.getClaimDate() + "|" + evidence.getId());

        // 3. 更新领用记录
        String sigStatus = claim.getProxyMode() == 1 ? "signed" : "signed";
        claimMapper.updateSignature(claim.getId(), evidence.getId(), sigStatus, contentHash,
                operatorResolver.currentOperatorName());

        // 4. 状态推进到 claimed
        claim.setStatus("claimed");
        claim.setSignatureStatus(sigStatus);
        claim.setSignedAt(LocalDateTime.now());
        claim.setContentHash(contentHash);
        claim.setSignatureEvidenceId(evidence.getId());
        claim.setUpdatedBy(operatorResolver.currentOperatorName());
        claimMapper.updateById(claim);

        // 5. 更新资产持有人
        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, claim.getAssetId()).last("FOR UPDATE"));
        if (asset != null) {
            SysUser employee = userMapper.selectById(claim.getEmployeeId());
            asset.setCurrentHolderId(claim.getEmployeeId());
            asset.setActiveClaimId(claim.getId());
            asset.setStatus("in_use");
            asset.setUserName(employee != null && employee.getName() != null
                    ? employee.getName() : (employee != null ? employee.getUsername() : ""));
            // 回写领用日期，供资产台账「領用日期」列展示（BUG-08）
            asset.setUsageDate(claim.getClaimDate() != null ? claim.getClaimDate().toString() : null);
            assetMapper.updateById(asset);
        }

        // 6. 写事件
        String eventType = claim.getProxyMode() == 1 ? "proxy_signed" : "signed";
        insertEvent(claim.getId(), eventType, operatorResolver.currentOperatorName(),
                claim.getProxyMode() == 1 ? "代辦補簽完成" : "員工簽署完成");
    }

    /* ==================== 取消 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void cancel(long claimId, String reason) {
        EamClaim claim = claimMapper.selectForUpdate(claimId);
        if (claim == null) throw new BusinessException("領用記錄不存在");
        if ("transferred".equals(claim.getStatus()) || claim.getSourceTransferId() != null)
            throw new BusinessException("調撥關聯領用不可直接取消，請至調撥管理辦理");
        boolean wasActive = "claimed".equals(claim.getStatus());
        if (wasActive) {
            EamAsset a = assetMapper.selectOne(new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, claim.getAssetId()).last("FOR UPDATE"));
            if (a == null || !Objects.equals(a.getActiveClaimId(), claimId)
                    || !Objects.equals(a.getCurrentHolderId(), claim.getEmployeeId())) throw new BusinessException("領用關係已變更");
        }
        if ("returned".equals(claim.getStatus())) throw new BusinessException("已歸還的領用不可取消");
        if ("cancelled".equals(claim.getStatus())) throw new BusinessException("領用已取消");

        // 如果已签署（claimed + signed），不允许取消
        if ("claimed".equals(claim.getStatus()) && "signed".equals(claim.getSignatureStatus())) {
            throw new BusinessException("已簽署的領用不可取消，請走歸還流程");
        }

        claim.setStatus("cancelled");
        claim.setCancelledReason(reason);
        claim.setUpdatedBy(operatorResolver.currentOperatorName());
        claimMapper.updateById(claim);

        // 如果是代办且已生效（claimed + proxy_pending），需要释放资产
        if (wasActive) {
            releaseAsset(claim.getAssetId());
        }

        insertEvent(claimId, "cancelled", operatorResolver.currentOperatorName(),
                hasText(reason) ? reason : "管理員取消領用");
    }

    /* ==================== 归还 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long returnAsset(EamReturnDTO dto) {
        return returnService.register(dto);
    }

    /* ==================== 内部方法 ==================== */

    private EamClaim requireClaim(long id) {
        EamClaim claim = claimMapper.selectById(id);
        if (claim == null) throw new BusinessException("領用記錄不存在");
        return claim;
    }

    private void releaseAsset(long assetId) {
        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, assetId).last("FOR UPDATE"));
        if (asset != null) {
            asset.setCurrentHolderId(null);
            asset.setActiveClaimId(null);
            asset.setStatus("idle");
            asset.setUserName(null);
            assetMapper.update(asset, new UpdateWrapper<EamAsset>().eq("id", asset.getId())
                    .set("current_holder_id", null).set("active_claim_id", null).set("user_name", null));
        }
    }

    private void insertEvent(long claimId, String eventType, String operatorName, String remark) {
        EamClaimEvent event = new EamClaimEvent();
        event.setClaimId(claimId);
        event.setEventType(eventType);
        event.setOperatorName(operatorName);
        event.setRemark(remark);
        eventMapper.insert(event);
    }

    private EamClaimVO toVO(EamClaim claim) {
        EamClaimVO vo = new EamClaimVO();
        BeanUtils.copyProperties(claim, vo, "claimDate", "signedAt", "returnDate", "createdAt", "updatedAt");
        vo.setClaimDate(claim.getClaimDate() != null ? claim.getClaimDate().toString() : null);
        vo.setSignedAt(DateTimeUtils.format(claim.getSignedAt()));
        vo.setReturnDate(claim.getReturnDate() != null ? claim.getReturnDate().toString() : null);
        vo.setCreatedAt(DateTimeUtils.format(claim.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(claim.getUpdatedAt()));
        vo.setOperator(claim.getOperatorName());

        // 资产信息
        EamAsset asset = assetMapper.selectById(claim.getAssetId());
        if (asset != null) {
            vo.setAssetNo(asset.getAssetNo());
            vo.setAssetName(asset.getAssetName());
            vo.setAssetType(asset.getAssetType());
            vo.setBrand(asset.getBrand());
            vo.setCompanyBrand(asset.getCompanyBrand());
        }

        // 员工信息
        SysUser employee = userMapper.selectById(claim.getEmployeeId());
        if (employee != null) {
            vo.setEmpNo(employee.getEmpId());
            vo.setEmpName(employee.getName() != null ? employee.getName() : employee.getUsername());
            vo.setDepartment(employee.getDepartment());
        }

        // 签名凭证
        if (claim.getSignatureEvidenceId() != null) {
            EamClaimEvidence evidence = evidenceMapper.selectById(claim.getSignatureEvidenceId());
            if (evidence != null) {
                vo.setSignatureImageUrl(evidence.getStoragePath());
            }
        }

        return vo;
    }

    private EamClaimEventVO toEventVO(EamClaimEvent event) {
        EamClaimEventVO vo = new EamClaimEventVO();
        vo.setId(event.getId());
        vo.setClaimId(event.getClaimId());
        vo.setEventType(event.getEventType());
        vo.setOperatorName(event.getOperatorName());
        vo.setRemark(event.getRemark());
        vo.setCreatedAt(DateTimeUtils.format(event.getCreatedAt()));
        return vo;
    }

    /** 不含關鍵字過濾的查詢構造器（用於 employeeSummary / stats 自行處理關鍵字匹配） */
    private LambdaQueryWrapper<EamClaim> queryWrapperNoKeyword(EamClaimQuery q) {
        LambdaQueryWrapper<EamClaim> w = new LambdaQueryWrapper<>();
        w.eq(hasText(q.getStatus()), EamClaim::getStatus, q.getStatus());
        w.eq(q.getEmployeeId() != null, EamClaim::getEmployeeId, q.getEmployeeId());
        // 注意：departmentId 不在 biz_eam_claim 表中，由 employeeSummary Java 層按員工部門過濾
        if (Boolean.TRUE.equals(q.getPendingSignature())) {
            w.in(EamClaim::getStatus, "pending_signature", "claimed")
                    .in(EamClaim::getSignatureStatus, "pending", "proxy_pending");
        }
        return w;
    }

    private LambdaQueryWrapper<EamClaim> queryWrapper(EamClaimQuery q) {
        LambdaQueryWrapper<EamClaim> w = queryWrapperNoKeyword(q);
        if (hasText(q.getKeyword())) {
            w.and(x -> x.like(EamClaim::getClaimNo, q.getKeyword().trim())
                    .or().like(EamClaim::getOperatorName, q.getKeyword().trim()));
        }
        return w;
    }

    private boolean hasText(String text) { return text != null && !text.isBlank(); }

    private LocalDate parseDate(String value) {
        if (!hasText(value)) throw new BusinessException("日期不能為空");
        try { return LocalDate.parse(value); }
        catch (RuntimeException e) { throw new BusinessException("日期格式應為 yyyy-MM-dd"); }
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }
}
