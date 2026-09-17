package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamReturnService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

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
    @Transactional(rollbackFor = Exception.class)
    public long register(EamReturnDTO dto) {
        // 确定来源
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

        // 释放资产（仅正常归还）
        if ("completed".equals(ret.getReturnStatus())) {
            releaseAsset(assetId);
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

        // 更新资产状态
        EamAsset asset = assetMapper.selectById(ret.getAssetId());
        if (asset != null) {
            switch (dto.getDisposition()) {
                case "scrapped" -> asset.setStatus("scrapped");
                case "written_off" -> asset.setStatus("scrapped"); // 注销也标记为报废
                case "idle" -> asset.setStatus("idle");
            }
            assetMapper.updateById(asset);
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

        ret.setRecovered(1);
        ret.setRecoveredDate(LocalDate.now());
        ret.setRecoveredNote(dto.getRecoveredNote());
        ret.setReturnStatus("exception_closed");
        returnMapper.updateById(ret);

        // 资产恢复为闲置
        EamAsset asset = assetMapper.selectById(ret.getAssetId());
        if (asset != null) {
            asset.setStatus("idle");
            asset.setCurrentHolderId(null);
            assetMapper.updateById(asset);
        }
    }

    private EamReturn requireReturn(long id) {
        EamReturn ret = returnMapper.selectById(id);
        if (ret == null) throw new BusinessException("歸還記錄不存在");
        return ret;
    }

    private void releaseAsset(long assetId) {
        EamAsset asset = assetMapper.selectOne(
                new LambdaQueryWrapper<EamAsset>().eq(EamAsset::getId, assetId).last("FOR UPDATE"));
        if (asset != null) {
            asset.setCurrentHolderId(null);
            asset.setActiveClaimId(null);
            asset.setStatus("idle");
            asset.setUserName(null);
            assetMapper.updateById(asset);
        }
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
            vo.setAssetName(asset.getAssetName());
        }

        // 员工信息
        SysUser employee = userMapper.selectById(ret.getEmployeeId());
        if (employee != null) {
            vo.setEmpName(employee.getName() != null ? employee.getName() : employee.getUsername());
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

    private boolean hasText(String text) { return text != null && !text.isBlank(); }

    private LocalDate parseDate(String value) {
        if (!hasText(value)) throw new BusinessException("日期不能為空");
        try { return LocalDate.parse(value); }
        catch (RuntimeException e) { throw new BusinessException("日期格式應為 yyyy-MM-dd"); }
    }
}
