package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.HrCertificateConstants;
import com.mftb.admin.entity.HrCertificateRequest;
import com.mftb.admin.mapper.HrCertificateRequestMapper;
import com.mftb.admin.service.HrCertificateCallbackService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 證明開具审批回调实现（独立事务：办理失败只回滚本回调，不影响 OA 流程状态落库）。
 * <p>
 * 幂等口径：已是 completed 的单据直接跳过；找不到关联单据也跳过（例如员工从 OA 中心
 * 直接发起的同名流程），保证对非自助入口零侵入。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrCertificateCallbackServiceImpl implements HrCertificateCallbackService {

    private final HrCertificateRequestMapper certMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public boolean isCertificateProcess(String processCode) {
        return HrCertificateConstants.PROCESS_CODE.equals(processCode);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void onFlowApproved(String flowNo) {
        HrCertificateRequest entity = findByFlowNo(flowNo);
        if (entity == null || HrCertificateConstants.STATUS_COMPLETED.equals(entity.getStatus())) {
            return;
        }
        entity.setStatus(HrCertificateConstants.STATUS_COMPLETED);
        entity.setResultRemark(HrCertificateConstants.ISSUED_REMARK);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        certMapper.updateById(entity);
        log.info("HR certificate approved: reqNo={}, flowNo={}", entity.getReqNo(), flowNo);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void onFlowRejected(String flowNo) {
        HrCertificateRequest entity = findByFlowNo(flowNo);
        if (entity == null || !HrCertificateConstants.STATUS_PENDING.equals(entity.getStatus())) {
            return;
        }
        entity.setStatus(HrCertificateConstants.STATUS_REJECTED);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        certMapper.updateById(entity);
        log.info("HR certificate rejected: reqNo={}, flowNo={}", entity.getReqNo(), flowNo);
    }

    private HrCertificateRequest findByFlowNo(String flowNo) {
        if (!StringUtils.hasText(flowNo)) {
            return null;
        }
        List<HrCertificateRequest> list = certMapper.selectList(
                new LambdaQueryWrapper<HrCertificateRequest>().eq(HrCertificateRequest::getFlowNo, flowNo));
        return list.isEmpty() ? null : list.get(0);
    }
}
