package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamCompensationService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class EamCompensationServiceImpl implements EamCompensationService {

    private final EamCompensationMapper compensationMapper;
    private final EamCompensationPaymentMapper paymentMapper;
    private final EamCompensationReviewMapper reviewMapper;
    private final EamReturnMapper returnMapper;
    private final EamClaimEvidenceMapper evidenceMapper;
    private final EamAssetMapper assetMapper;
    private final SysUserMapper userMapper;
    private final BizSeqService bizSeqService;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<EamCompensationVO> page(EamCompensationQuery query) {
        Page<EamCompensation> page = compensationMapper.selectPage(
                new Page<>(PageResult.normalizePage(query.getPage()), PageResult.normalizeSize(query.getSize())),
                queryWrapper(query).orderByDesc(EamCompensation::getCreatedAt, EamCompensation::getId));
        List<EamCompensationVO> records = page.getRecords().stream().map(this::toVO).toList();
        return new PageResult<>(records, page.getTotal());
    }

    @Override
    public EamCompensationVO detail(long id) {
        EamCompensation comp = requireCompensation(id);
        EamCompensationVO vo = toVO(comp);
        EamAsset asset = assetMapper.selectById(comp.getAssetId());
        if (asset != null) {
            vo.setParams(JsonUtils.parseMap(asset.getParams()));
            vo.setCategoryCode(asset.getCategoryCode());
        }
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long create(EamReturnDTO returnDto, long returnId) {
        EamReturn ret = returnMapper.selectById(returnId);
        if (ret == null) throw new BusinessException("歸還記錄不存在");
        if (!"exception_pending".equals(ret.getReturnStatus())) {
            throw new BusinessException("僅異常歸還可創建賠付記錄");
        }

        // 获取资产信息
        EamAsset asset = assetMapper.selectById(ret.getAssetId());
        if (asset == null) throw new BusinessException("資產不存在");

        // 生成赔付编号
        String compNo = bizSeqService.next(BizSeqService.RULE_EAM_COMPENSATION);

        // 创建赔付记录
        EamCompensation comp = new EamCompensation();
        comp.setCompNo(compNo);
        comp.setReturnId(returnId);
        comp.setAssetId(ret.getAssetId());
        comp.setAssetName(EamAssetServiceImpl.stripBrandPrefix(asset.getAssetName(), asset.getBrand()));
        comp.setAssetNo(asset.getAssetNo());
        comp.setHolderId(ret.getEmployeeId());

        // 获取持有人姓名
        SysUser holder = userMapper.selectById(ret.getEmployeeId());
        comp.setHolderName(holder != null && holder.getName() != null ? holder.getName() : holder != null ? holder.getUsername() : "");

        // 根据资产状况判断损失类型
        comp.setDamageType("lost".equals(ret.getAssetCondition()) ? "loss" : "damage");
        comp.setAmount(0L);
        comp.setNetPaid(0L);
        comp.setStatus("pending");
        comp.setReviewRequired(0);
        comp.setReason(ret.getExceptionReason());
        comp.setOperatorId(operatorResolver.currentUser() != null ? operatorResolver.currentUser().getId() : null);
        comp.setOperatorName(operatorResolver.currentOperatorName());
        comp.setCreatedBy(operatorResolver.currentOperatorName());
        comp.setUpdatedBy(operatorResolver.currentOperatorName());
        compensationMapper.insert(comp);

        // 更新归还记录关联赔付
        ret.setCompensationId(comp.getId());
        returnMapper.updateById(ret);

        return comp.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void setLiability(EamCompensationLiabilityDTO dto) {
        EamCompensation comp = compensationMapper.selectForUpdate(dto.getCompensationId());
        if (comp == null) throw new BusinessException("賠付記錄不存在");
        if (!"pending".equals(comp.getStatus())) throw new BusinessException("當前狀態不可定責");
        if (dto.getAmount() == null || dto.getAmount() <= 0) throw new BusinessException("應賠金額必須大於0");

        comp.setParty(dto.getParty());
        comp.setResponsibleId(dto.getResponsibleId());
        comp.setResponsibleName(dto.getResponsibleName());
        comp.setDepartment(dto.getDepartment());
        comp.setCause(dto.getCause());
        comp.setAmount(dto.getAmount());
        comp.setBasis(dto.getBasis());
        comp.setStatus("confirmed");
        comp.setUpdatedBy(operatorResolver.currentOperatorName());
        compensationMapper.updateById(comp);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void waive(EamCompensationWaiveDTO dto) {
        EamCompensation comp = compensationMapper.selectForUpdate(dto.getCompensationId());
        if (comp == null) throw new BusinessException("賠付記錄不存在");
        if (!"pending".equals(comp.getStatus())) throw new BusinessException("當前狀態不可免賠");
        if (!hasText(dto.getWaiveReason())) throw new BusinessException("免賠必須填寫原因");

        comp.setWaiveReason(dto.getWaiveReason());
        comp.setStatus("waived");
        comp.setUpdatedBy(operatorResolver.currentOperatorName());
        compensationMapper.updateById(comp);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void addPayment(EamCompensationPaymentDTO dto) {
        EamCompensation comp = compensationMapper.selectForUpdate(dto.getCompensationId());
        if (comp == null) throw new BusinessException("賠付記錄不存在");
        if (!"confirmed".equals(comp.getStatus()) && !"partially_paid".equals(comp.getStatus())) {
            throw new BusinessException("當前狀態不可收款");
        }
        if (dto.getAmount() == null || dto.getAmount() <= 0) throw new BusinessException("金額必須大於0");

        boolean isRefund = "refund".equals(dto.getType());
        if (isRefund) {
            if (!"refund_pending".equals(comp.getStatus())) throw new BusinessException("當前狀態不可退款");
            if (dto.getAmount() > comp.getNetPaid()) throw new BusinessException("退款金額不可超過淨收款");
        } else {
            long remaining = comp.getAmount() - comp.getNetPaid();
            if (dto.getAmount() > remaining) throw new BusinessException("收款金額不可超過剩餘應賠");
        }

        LocalDate paymentDate = parseDate(dto.getPaymentDate());

        // 创建收/退款记录
        EamCompensationPayment payment = new EamCompensationPayment();
        payment.setCompensationId(comp.getId());
        payment.setType(dto.getType());
        payment.setAmount(dto.getAmount());
        payment.setPaymentDate(paymentDate);
        payment.setReason(dto.getReason());
        payment.setOperatorId(operatorResolver.currentUser() != null ? operatorResolver.currentUser().getId() : null);
        payment.setOperatorName(operatorResolver.currentOperatorName());
        paymentMapper.insert(payment);

        // 保存凭证
        if (hasText(dto.getEvidenceDataUrl())) {
            EamClaimEvidence evidence = new EamClaimEvidence();
            evidence.setClaimId(0L);
            evidence.setBizType("compensation");
            evidence.setBizId(comp.getId());
            evidence.setEvidenceType("return_photo");
            evidence.setStoragePath(dto.getEvidenceDataUrl());
            evidence.setFileName(dto.getEvidenceFileName());
            evidence.setContentType("image/png");
            evidenceMapper.insert(evidence);
            payment.setEvidenceId(evidence.getId());
            paymentMapper.updateById(payment);
        }

        // 更新赔付记录
        long newNetPaid = isRefund ? comp.getNetPaid() - dto.getAmount() : comp.getNetPaid() + dto.getAmount();
        String newStatus;
        if (isRefund) {
            newStatus = newNetPaid == 0 ? "confirmed" : "partially_paid";
            compensationMapper.addRefund(comp.getId(), dto.getAmount(), newStatus, operatorResolver.currentOperatorName());
        } else {
            newStatus = newNetPaid >= comp.getAmount() ? "paid" : "partially_paid";
            compensationMapper.addPayment(comp.getId(), dto.getAmount(), newStatus, operatorResolver.currentOperatorName());
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void review(EamCompensationReviewDTO dto) {
        EamCompensation comp = compensationMapper.selectForUpdate(dto.getCompensationId());
        if (comp == null) throw new BusinessException("賠付記錄不存在");
        if (comp.getReviewRequired() != 1) throw new BusinessException("當前記錄不需要復核");
        if (dto.getNewAmount() == null || dto.getNewAmount() < 0) throw new BusinessException("復核後金額不能為負");

        // 创建复核记录
        EamCompensationReview review = new EamCompensationReview();
        review.setCompensationId(comp.getId());
        review.setReviewDate(LocalDate.now());
        review.setBeforeAmount(comp.getAmount());
        review.setAfterAmount(dto.getNewAmount());
        review.setReason(dto.getReason());
        review.setOperatorId(operatorResolver.currentUser() != null ? operatorResolver.currentUser().getId() : null);
        review.setOperatorName(operatorResolver.currentOperatorName());
        reviewMapper.insert(review);

        // 更新赔付记录
        String newStatus;
        if (comp.getNetPaid() > dto.getNewAmount()) {
            newStatus = "refund_pending";
        } else if (comp.getNetPaid() == dto.getNewAmount()) {
            newStatus = "paid";
        } else {
            newStatus = "partially_paid";
        }
        compensationMapper.updateAfterReview(comp.getId(), dto.getNewAmount(), newStatus, operatorResolver.currentOperatorName());
    }

    private EamCompensation requireCompensation(long id) {
        EamCompensation comp = compensationMapper.selectById(id);
        if (comp == null) throw new BusinessException("賠付記錄不存在");
        return comp;
    }

    private EamCompensationVO toVO(EamCompensation comp) {
        EamCompensationVO vo = new EamCompensationVO();
        BeanUtils.copyProperties(comp, vo, "createdAt", "updatedAt");
        vo.setCreatedAt(DateTimeUtils.format(comp.getCreatedAt()));
        vo.setUpdatedAt(DateTimeUtils.format(comp.getUpdatedAt()));

        // 收款/退款记录
        List<EamCompensationPayment> payments = paymentMapper.selectList(
                new LambdaQueryWrapper<EamCompensationPayment>()
                        .eq(EamCompensationPayment::getCompensationId, comp.getId())
                        .orderByAsc(EamCompensationPayment::getCreatedAt));
        List<EamCompensationVO.PaymentVO> paymentVOs = new ArrayList<>();
        for (EamCompensationPayment p : payments) {
            EamCompensationVO.PaymentVO pvo = new EamCompensationVO.PaymentVO();
            pvo.setId(p.getId());
            pvo.setType(p.getType());
            pvo.setAmount(p.getAmount());
            pvo.setPaymentDate(p.getPaymentDate() != null ? p.getPaymentDate().toString() : null);
            pvo.setReason(p.getReason());
            pvo.setOperatorName(p.getOperatorName());
            pvo.setCreatedAt(DateTimeUtils.format(p.getCreatedAt()));
            if (p.getEvidenceId() != null) {
                EamClaimEvidence evidence = evidenceMapper.selectById(p.getEvidenceId());
                if (evidence != null) pvo.setEvidenceImageUrl(evidence.getStoragePath());
            }
            paymentVOs.add(pvo);
        }
        vo.setPayments(paymentVOs);

        // 复核记录
        List<EamCompensationReview> reviews = reviewMapper.selectList(
                new LambdaQueryWrapper<EamCompensationReview>()
                        .eq(EamCompensationReview::getCompensationId, comp.getId())
                        .orderByAsc(EamCompensationReview::getCreatedAt));
        List<EamCompensationVO.ReviewVO> reviewVOs = new ArrayList<>();
        for (EamCompensationReview r : reviews) {
            EamCompensationVO.ReviewVO rvo = new EamCompensationVO.ReviewVO();
            rvo.setId(r.getId());
            rvo.setReviewDate(r.getReviewDate() != null ? r.getReviewDate().toString() : null);
            rvo.setBeforeAmount(r.getBeforeAmount());
            rvo.setAfterAmount(r.getAfterAmount());
            rvo.setReason(r.getReason());
            rvo.setOperatorName(r.getOperatorName());
            rvo.setCreatedAt(DateTimeUtils.format(r.getCreatedAt()));
            reviewVOs.add(rvo);
        }
        vo.setReviews(reviewVOs);

        return vo;
    }

    private LambdaQueryWrapper<EamCompensation> queryWrapper(EamCompensationQuery q) {
        LambdaQueryWrapper<EamCompensation> w = new LambdaQueryWrapper<>();
        if (hasText(q.getKeyword())) {
            w.and(x -> x.like(EamCompensation::getCompNo, q.getKeyword().trim())
                    .or().like(EamCompensation::getAssetNo, q.getKeyword().trim())
                    .or().like(EamCompensation::getHolderName, q.getKeyword().trim()));
        }
        if (hasText(q.getCompNo())) w.like(EamCompensation::getCompNo, q.getCompNo().trim());
        if (hasText(q.getAssetName())) w.like(EamCompensation::getAssetName, q.getAssetName().trim());
        if (hasText(q.getHolderName())) w.like(EamCompensation::getHolderName, q.getHolderName().trim());
        w.eq(hasText(q.getStatus()), EamCompensation::getStatus, q.getStatus());
        w.eq(hasText(q.getDamageType()), EamCompensation::getDamageType, q.getDamageType());
        w.eq(hasText(q.getParty()), EamCompensation::getParty, q.getParty());
        w.eq(q.getReviewRequired() != null, EamCompensation::getReviewRequired,
                q.getReviewRequired() != null && q.getReviewRequired() ? 1 : 0);
        return w;
    }

    private boolean hasText(String text) { return text != null && !text.isBlank(); }

    private LocalDate parseDate(String value) {
        if (!hasText(value)) throw new BusinessException("日期不能為空");
        try { return LocalDate.parse(value); }
        catch (RuntimeException e) { throw new BusinessException("日期格式應為 yyyy-MM-dd"); }
    }
}
