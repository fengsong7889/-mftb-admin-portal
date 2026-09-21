package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamReturnService;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.service.EamCompensationService;
import com.mftb.admin.service.EamLossService;
import com.mftb.admin.service.EamRepairService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamReturnServiceImpl implements EamReturnService {

    private final EamReturnMapper returnMapper;
    private final EamClaimMapper claimMapper;
    private final EamBorrowMapper borrowMapper;
    private final EamAssetMapper assetMapper;
    private final EamClaimEvidenceMapper evidenceMapper;
    private final SysUserMapper userMapper;
    private final EamLocationMapper locationMapper;
    private final EamScrapMapper scrapMapper;
    private final DepartmentService departmentService;
    private final EamCompensationService compensationService;
    private final EamRepairService repairService;
    private final EamLossService lossService;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<EamReturnVO> page(EamReturnQuery query) {
        Page<EamReturn> page = returnMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                queryWrapper(query).orderByDesc(EamReturn::getCreatedAt, EamReturn::getId));
        List<EamReturnVO> records = page.getRecords().stream().map(this::toVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamReturnVO detail(long id) {
        EamReturn ret = requireReturn(id);
        return toVO(ret);
    }

    @Override
    public EamReturnVO byClaim(long claimId) {
        EamReturn ret = returnMapper.selectOne(new LambdaQueryWrapper<EamReturn>()
                .eq(EamReturn::getClaimId, claimId)
                .orderByDesc(EamReturn::getId)
                .last("LIMIT 1"));
        return ret != null ? toVO(ret) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long register(EamReturnDTO dto) {
        // 确定来源
        if (dto.getClaimId() != null && dto.getBorrowId() != null) throw new BusinessException("只能指定一種歸還來源");
        EamClaim claim = null;
        EamBorrow borrow = null;
        String sourceType;
        Long sourceId;
        Long assetId;
        Long employeeId;

        if (dto.getClaimId() != null) {
            claim = claimMapper.selectForUpdate(dto.getClaimId());
            if (claim == null) throw new BusinessException("領用記錄不存在");
            if (!"claimed".equals(claim.getStatus())) throw new BusinessException("僅在用領用可歸還");
            sourceType = "claim";
            sourceId = claim.getId();
            assetId = claim.getAssetId();
            employeeId = claim.getEmployeeId();
        } else if (dto.getBorrowId() != null) {
            borrow = borrowMapper.selectForUpdate(dto.getBorrowId());
            if (borrow == null) throw new BusinessException("借用記錄不存在");
            if (!"active".equals(borrow.getStatus()) && !"overdue".equals(borrow.getStatus())) {
                throw new BusinessException("當前借用狀態不可歸還");
            }
            sourceType = "borrow";
            sourceId = borrow.getId();
            assetId = borrow.getAssetId();
            employeeId = borrow.getHolderId();
        } else {
            throw new BusinessException("必須指定領用或借用來源");
        }

        LocalDate returnDate = parseDate(dto.getReturnDate());
        if (returnDate.isAfter(LocalDate.now())) throw new BusinessException("歸還日期不可晚於今日");

        // 资产状况校验
        String condition = dto.getAssetCondition() != null ? dto.getAssetCondition() : "normal";
        if (!"normal".equals(condition) && !hasText(dto.getExceptionReason())) {
            throw new BusinessException("資產狀況異常時必須填寫異常原因");
        }

        String receiveDepartment = resolveReceiveDepartment(dto.getReceiveDepartment());
        EamAsset holding = assetMapper.selectOne(new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, assetId).last("FOR UPDATE"));
        if (holding == null || !"in_use".equals(holding.getStatus()) || !Objects.equals(holding.getCurrentHolderId(), employeeId)
                || (claim != null && !Objects.equals(holding.getActiveClaimId(), claim.getId()))
                || (borrow != null && (holding.getActiveClaimId() != null || !"borrowed".equals(holding.getHoldType()))))
            throw new BusinessException("資產持有關係已變更，請刷新後從當前有效領用或借用辦理歸還");
        LocalDate startDate = claim != null ? claim.getClaimDate() : borrow.getStartDate();
        if (startDate != null && returnDate.isBefore(startDate)) throw new BusinessException("歸還日期不可早於領用或借用日期");

        // 生成归还编号
        String returnNo = bizSeqService.next(BizSeqService.RULE_EAM_RETURN);

        // 创建归还记录
        EamReturn ret = new EamReturn();
        ret.setReturnNo(returnNo);
        ret.setSourceType(sourceType);
        ret.setSourceId(sourceId);
        ret.setClaimId(dto.getClaimId());
        ret.setAssetId(assetId);
        ret.setEmployeeId(employeeId);
        ret.setOperatorName(operatorResolver.currentOperatorName());
        SysUser currentOperator = operatorResolver.currentUser();
        if (currentOperator != null) {
            ret.setOperatorId(currentOperator.getId());
        }
        ret.setReturnDate(returnDate);
        ret.setReturnReason(dto.getReturnReason());
        ret.setConditionNote(dto.getConditionNote());
        ret.setAssetCondition(condition);
        ret.setExceptionReason(dto.getExceptionReason());
        ret.setReturnStatus("normal".equals(condition) ? "completed" : "exception_pending");
        ret.setActualReturneeId(dto.getActualReturneeId());
        ret.setActualReturneeName(dto.getActualReturneeName());
        ret.setRecovered(0);
        returnMapper.insert(ret);

        // 保存凭证
        if (hasText(dto.getEvidenceDataUrl())) {
            EamClaimEvidence evidence = new EamClaimEvidence();
            evidence.setClaimId(0L); // 归还凭证不关联领用
            evidence.setBizType("return");
            evidence.setBizId(ret.getId());
            evidence.setEvidenceType("return_photo");
            evidence.setStoragePath(dto.getEvidenceDataUrl());
            evidence.setFileName(dto.getEvidenceFileName());
            evidence.setContentType("image/png");
            evidenceMapper.insert(evidence);
            ret.setReturnEvidenceId(evidence.getId());
            returnMapper.updateById(ret);
        }

        // 更新来源记录
        if (claim != null) {
            claim.setStatus("returned");
            claim.setReturnDate(returnDate);
            claim.setReturnReason(dto.getReturnReason());
            claim.setReturnId(ret.getId());
            claim.setUpdatedBy(operatorResolver.currentOperatorName());
            claimMapper.updateById(claim);
        } else if (borrow != null) {
            borrow.setStatus("returned");
            borrow.setReturnDate(returnDate);
            borrow.setReturnId(ret.getId());
            borrow.setUpdatedBy(operatorResolver.currentOperatorName());
            borrowMapper.updateById(borrow);
        }

        // 更新资产状态（仅正常归还）：按接收管理部门/归还位置归位，实现归还即承接
        if ("completed".equals(ret.getReturnStatus())) {
            releaseAsset(assetId, receiveDepartment, dto.getReceiveLocationId());
        }

        // 遗失状况：自动生成遗失单，资产状态由遗失模块统一管理
        if ("lost".equals(condition)) {
            try {
                long lossId = lossService.createFromReturn(ret.getId());
                log.info("归还验收遗失自动建立遗失单 lossId={}, returnId={}", lossId, ret.getId());
            } catch (Exception e) {
                log.error("归还验收遗失自动建立遗失单失败 returnId={}: {}", ret.getId(), e.getMessage());
                throw new BusinessException("歸還登記成功但建立遺失單失敗：" + e.getMessage());
            }
        }

        return ret.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void dispose(EamReturnDispositionDTO dto) {
        EamReturn ret = returnMapper.selectForUpdate(dto.getReturnId());
        if (ret == null) throw new BusinessException("歸還記錄不存在");
        if (!"exception_pending".equals(ret.getReturnStatus())) {
            throw new BusinessException("僅異常歸還可登記處置");
        }

        LocalDate dispositionDate = parseDate(dto.getDispositionDate());
        String receiveDepartment = resolveReceiveDepartment(dto.getReceiveDepartment());
        ret.setDisposition(dto.getDisposition());
        ret.setDispositionDate(dispositionDate);
        ret.setReturnStatus("exception_closed");

        // 保存处置凭证
        if (hasText(dto.getEvidenceDataUrl())) {
            EamClaimEvidence evidence = new EamClaimEvidence();
            evidence.setClaimId(0L);
            evidence.setBizType("return");
            evidence.setBizId(ret.getId());
            evidence.setEvidenceType("return_photo");
            evidence.setStoragePath(dto.getEvidenceDataUrl());
            evidence.setFileName(dto.getEvidenceFileName());
            evidence.setContentType("image/png");
            evidenceMapper.insert(evidence);
            ret.setDispositionEvidenceId(evidence.getId());
        }

        returnMapper.updateById(ret);

        // 更新资产状态（遗失资产由遗失模块管理，此处跳过）
        EamAsset asset = assetMapper.selectById(ret.getAssetId());
        if (asset != null && !"lost".equals(ret.getAssetCondition())) {
            switch (dto.getDisposition()) {
                case "scrapped" -> asset.setStatus("scrapped");
                case "written_off" -> asset.setStatus("scrapped"); // 注销也标记为报废
                case "apply_repair" -> asset.setStatus("in_repair"); // 申请维修
                case "idle" -> {
                    asset.setStatus("idle");
                    asset.setCurrentHolderId(null);
                    asset.setActiveClaimId(null);
                    asset.setUserName(null);
                    applyReceiveLocation(asset, receiveDepartment, dto.getReceiveLocationId());
                }
            }
            assetMapper.updateById(asset);
        }

        // 自动创建赔付记录（业务选择需要鉴定赔付定责时）
        if (Boolean.TRUE.equals(dto.getNeedCompensation())) {
            try {
                long compId = compensationService.createFromDispose(ret.getId());
                log.info("处置流程自动创建赔付记录成功 compId={}, returnId={}", compId, ret.getId());
            } catch (Exception e) {
                log.error("处置流程自动创建赔付记录失败 returnId={}: {}", ret.getId(), e.getMessage());
                throw new BusinessException("處置成功但創建賠付記錄失敗：" + e.getMessage());
            }
        }

        // 报废/遗失核销时自动创建报废记录（流入资产报废菜单）
        if ("scrapped".equals(dto.getDisposition()) || "written_off".equals(dto.getDisposition())) {
            createScrapRecordFromDispose(ret, asset, dispositionDate);
        }

        // 申请维修时自动创建维修记录（流入维修管理菜单）
        if ("apply_repair".equals(dto.getDisposition())) {
            try {
                long repairId = repairService.createFromDispose(ret.getId());
                log.info("处置流程自动创建维修记录成功 repairId={}, returnId={}", repairId, ret.getId());
            } catch (Exception e) {
                log.error("处置流程自动创建维修记录失败 returnId={}: {}", ret.getId(), e.getMessage());
                throw new BusinessException("處置成功但創建維修記錄失敗：" + e.getMessage());
            }
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recover(EamReturnRecoverDTO dto) {
        EamReturn ret = returnMapper.selectForUpdate(dto.getReturnId());
        if (ret == null) throw new BusinessException("歸還記錄不存在");
        if (!"exception_pending".equals(ret.getReturnStatus())) {
            throw new BusinessException("僅異常歸還可登記找回");
        }
        if (ret.getRecovered() == 1) {
            throw new BusinessException("已登記找回，不可重複操作");
        }

        // 遗失资产已迁入遗失找回模块，引导使用新接口
        if ("lost".equals(ret.getAssetCondition())) {
            throw new BusinessException("遺失資產找回請前往「遺失找回」模塊操作");
        }

        String receiveDepartment = resolveReceiveDepartment(dto.getReceiveDepartment());
        ret.setRecovered(1);
        ret.setRecoveredDate(LocalDate.now());
        ret.setRecoveredNote(dto.getRecoveredNote());
        ret.setReturnStatus("exception_closed");
        returnMapper.updateById(ret);

        // 资产恢复为闲置（按接收管理部门/归还位置归位）
        EamAsset asset = assetMapper.selectById(ret.getAssetId());
        if (asset != null) {
            asset.setStatus("idle");
            asset.setCurrentHolderId(null);
            asset.setUserName(null);
            asset.setActiveClaimId(null);
            applyReceiveLocation(asset, receiveDepartment, dto.getReceiveLocationId());
            // MyBatis-Plus updateById 默认 NOT_NULL 策略，null 字段需用 UpdateWrapper 显式清空
            assetMapper.update(asset, new UpdateWrapper<EamAsset>()
                    .eq("id", asset.getId())
                    .set("status", asset.getStatus())
                    .set("current_holder_id", null)
                    .set("user_name", null)
                    .set("active_claim_id", null)
                    .set("department", asset.getDepartment())
                    .set("location_id", asset.getLocationId())
                    .set("location", asset.getLocation()));
        }
    }

    private EamReturn requireReturn(long id) {
        EamReturn ret = returnMapper.selectById(id);
        if (ret == null) throw new BusinessException("歸還記錄不存在");
        return ret;
    }

    /**
     * 释放资产并归位：清持有人转闲置，同时按「接收管理部门 + 归还位置」更新归属（归还即承接）。
     * 接收部门/位置未提供时保持原值，兼容旧调用。
     */
    private void releaseAsset(long assetId, String receiveDepartment, Long receiveLocationId) {
        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, assetId).last("FOR UPDATE"));
        if (asset != null) {
            asset.setCurrentHolderId(null);
            asset.setActiveClaimId(null);
            asset.setStatus("idle");
            asset.setUserName(null);
            applyReceiveLocation(asset, receiveDepartment, receiveLocationId);
            // MyBatis-Plus updateById 默认 NOT_NULL 策略，null 字段需用 UpdateWrapper 显式清空
            assetMapper.update(asset, new UpdateWrapper<EamAsset>()
                    .eq("id", asset.getId())
                    .set("current_holder_id", null)
                    .set("active_claim_id", null)
                    .set("status", "idle")
                    .set("user_name", null)
                    .set("department", asset.getDepartment())
                    .set("location_id", asset.getLocationId())
                    .set("location", asset.getLocation()));
        }
    }

    /** 应用接收管理部门/归还位置（校验部门与位置存在性，非法值忽略并告警） */
    private void applyReceiveLocation(EamAsset asset, String receiveDepartment, Long receiveLocationId) {
        if (hasText(receiveDepartment)) {
            asset.setDepartment(receiveDepartment.trim());
        }
        if (receiveLocationId != null && receiveLocationId > 0) {
            EamLocation location = locationMapper.selectById(receiveLocationId);
            if (location == null) {
                log.warn("归还归位失败：存放位置不存在 locationId={}，保持原位置 {}", receiveLocationId, asset.getLocation());
            } else {
                asset.setLocationId(location.getId());
                asset.setLocation(location.getName());
            }
        }
    }

    /** 从归还处置自动创建报废记录（流入资产报废菜单，待操作人员补充残值/处置方式等） */
    private void createScrapRecordFromDispose(EamReturn ret, EamAsset asset, LocalDate scrapDate) {
        if (asset == null) {
            log.warn("归还处置报废但未找到资产 assetId={}，跳过报废记录创建", ret.getAssetId());
            return;
        }
        EamScrap scrap = new EamScrap();
        scrap.setAssetId(asset.getId());
        scrap.setAssetNo(asset.getAssetNo());
        scrap.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
        scrap.setAssetType(asset.getCategoryCode());
        scrap.setBrand(asset.getBrand());
        scrap.setScrapDate(scrapDate);
        scrap.setApplyBy(operatorResolver.currentOperatorName());
        SysUser currentUser = operatorResolver.currentUser();
        if (currentUser != null) {
            scrap.setEmpId(currentUser.getEmpId());
        }
        // 报废原因：根据处置类型和异常原因生成
        String reason = "written_off".equals(ret.getDisposition())
                ? "遺失核銷（來源歸還單 " + ret.getReturnNo() + "）"
                : "歸還處置報廢（來源歸還單 " + ret.getReturnNo() + "）";
        if (hasText(ret.getExceptionReason())) {
            reason += "：" + ret.getExceptionReason();
        }
        scrap.setReason(reason);
        scrap.setResidualValue(BigDecimal.ZERO);
        scrap.setReturnId(ret.getId());
        scrap.setStatus("pending");
        scrap.setCreatedBy(operatorResolver.currentOperatorName());
        scrap.setUpdatedBy(operatorResolver.currentOperatorName());
        scrapMapper.insert(scrap);
        log.info("处置流程自动创建报废记录 scrapId={}, assetId={}, returnId={}", scrap.getId(), asset.getId(), ret.getId());
    }

    private EamReturnVO toVO(EamReturn ret) {
        EamReturnVO vo = new EamReturnVO();
        BeanUtils.copyProperties(ret, vo, "returnDate", "dispositionDate", "recoveredDate", "createdAt", "updatedAt");
        vo.setReturnDate(ret.getReturnDate() != null ? ret.getReturnDate().toString() : null);
        vo.setDispositionDate(ret.getDispositionDate() != null ? ret.getDispositionDate().toString() : null);
        vo.setRecoveredDate(ret.getRecoveredDate() != null ? ret.getRecoveredDate().toString() : null);
        vo.setCreatedAt(DateTimeUtils.format(ret.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(ret.getUpdatedAt()));

        // 兼容旧字段
        vo.setClaimId(ret.getClaimId());
        if ("borrow".equals(ret.getSourceType())) {
            vo.setBorrowId(ret.getSourceId());
        }

        // 资产信息
        EamAsset asset = assetMapper.selectById(ret.getAssetId());
        if (asset != null) {
            vo.setAssetNo(asset.getAssetNo());
            vo.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
            vo.setParams(JsonUtils.parseMap(asset.getParams()));
            vo.setCategoryCode(asset.getCategoryCode());
        }

        // 员工信息
        SysUser employee = userMapper.selectById(ret.getEmployeeId());
        if (employee != null) {
            vo.setEmpName(employee.getName() != null ? employee.getName() : employee.getUsername());
            vo.setEmpNo(employee.getEmpId());
            vo.setDepartment(employee.getDepartment());
        }

        // 实际归还人工号
        if (ret.getActualReturneeId() != null) {
            SysUser returnee = userMapper.selectById(ret.getActualReturneeId());
            if (returnee != null) {
                vo.setActualReturneeNo(returnee.getEmpId());
            }
        }

        // 归还接收人工号
        if (ret.getOperatorId() != null) {
            SysUser operator = userMapper.selectById(ret.getOperatorId());
            if (operator != null) {
                vo.setOperatorNo(operator.getEmpId());
            }
        }

        // 凭证
        if (ret.getReturnEvidenceId() != null) {
            EamClaimEvidence evidence = evidenceMapper.selectById(ret.getReturnEvidenceId());
            if (evidence != null) {
                vo.setEvidenceImageUrl(evidence.getStoragePath());
            }
        }

        return vo;
    }

    private LambdaQueryWrapper<EamReturn> queryWrapper(EamReturnQuery q) {
        LambdaQueryWrapper<EamReturn> w = new LambdaQueryWrapper<>();
        if (hasText(q.getKeyword())) {
            w.and(x -> x.like(EamReturn::getReturnNo, q.getKeyword().trim())
                    .or().like(EamReturn::getOperatorName, q.getKeyword().trim()));
        }
        if (hasText(q.getReturnNo())) {
            w.like(EamReturn::getReturnNo, q.getReturnNo().trim());
        }
        if (hasText(q.getAssetKeyword())) {
            String kw = q.getAssetKeyword().trim();
            List<Long> assetIds = assetMapper.selectList(
                    new LambdaQueryWrapper<EamAsset>()
                            .like(EamAsset::getAssetNo, kw)
                            .or().like(EamAsset::getAssetName, kw)
                            .select(EamAsset::getId)
            ).stream().map(EamAsset::getId).toList();
            if (assetIds.isEmpty()) {
                w.eq(EamReturn::getId, -1L);
            } else {
                w.in(EamReturn::getAssetId, assetIds);
            }
        }
        if (hasText(q.getEmpName())) {
            String kw = q.getEmpName().trim();
            List<Long> empIds = userMapper.selectList(
                    new LambdaQueryWrapper<SysUser>()
                            .like(SysUser::getName, kw)
                            .or().like(SysUser::getUsername, kw)
                            .select(SysUser::getId)
            ).stream().map(SysUser::getId).toList();
            if (empIds.isEmpty()) {
                w.eq(EamReturn::getId, -1L);
            } else {
                w.in(EamReturn::getEmployeeId, empIds);
            }
        }
        if (hasText(q.getActualReturneeName())) {
            w.like(EamReturn::getActualReturneeName, q.getActualReturneeName().trim());
        }
        if (q.getDepartmentId() != null) {
            List<Long> empIds = userMapper.selectList(
                    new LambdaQueryWrapper<SysUser>()
                            .eq(SysUser::getDepartmentId, q.getDepartmentId())
                            .select(SysUser::getId)
            ).stream().map(SysUser::getId).toList();
            if (empIds.isEmpty()) {
                w.eq(EamReturn::getId, -1L);
            } else {
                w.in(EamReturn::getEmployeeId, empIds);
            }
        }
        w.eq(hasText(q.getSourceType()), EamReturn::getSourceType, q.getSourceType());
        w.eq(hasText(q.getReturnStatus()), EamReturn::getReturnStatus, q.getReturnStatus());
        w.eq(hasText(q.getAssetCondition()), EamReturn::getAssetCondition, q.getAssetCondition());
        if (hasText(q.getStartDate())) {
            w.ge(EamReturn::getReturnDate, LocalDate.parse(q.getStartDate(), DateTimeFormatter.ISO_DATE));
        }
        if (hasText(q.getEndDate())) {
            w.le(EamReturn::getReturnDate, LocalDate.parse(q.getEndDate(), DateTimeFormatter.ISO_DATE));
        }
        return w;
    }

    /** 可选接收部门：未填写时保留资产原归属，提供时必须通过部门有效性校验。 */
    private String resolveReceiveDepartment(String name) {
        return hasText(name) ? departmentService.requireEnabledDepartmentName(name) : null;
    }

    private boolean hasText(String text) { return text != null && !text.isBlank(); }

    private LocalDate parseDate(String value) {
        if (!hasText(value)) throw new BusinessException("日期不能為空");
        try { return LocalDate.parse(value); }
        catch (RuntimeException e) { throw new BusinessException("日期格式應為 yyyy-MM-dd"); }
    }
}
