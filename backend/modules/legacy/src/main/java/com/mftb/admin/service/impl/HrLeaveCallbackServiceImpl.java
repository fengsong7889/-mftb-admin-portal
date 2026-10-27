package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.constant.HrLeaveConstants;
import com.mftb.admin.entity.HrLeaveBalance;
import com.mftb.admin.entity.HrLeaveRequest;
import com.mftb.admin.mapper.HrLeaveBalanceMapper;
import com.mftb.admin.mapper.HrLeaveRequestMapper;
import com.mftb.admin.service.HrLeaveCallbackService;
import com.mftb.admin.service.SysHrDictService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 请假审批回调实现（独立事务：办理失败只回滚本回调，不影响 OA 流程状态落库）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrLeaveCallbackServiceImpl implements HrLeaveCallbackService {

    private final HrLeaveRequestMapper leaveMapper;
    private final HrLeaveBalanceMapper balanceMapper;
    private final OperatorResolver operatorResolver;
    private final SysHrDictService dictService;


    @Override
    public boolean isLeaveProcess(String processCode) {
        return HrLeaveConstants.PROCESS_CODE.equals(processCode);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW,
            rollbackFor = Exception.class)
    public void onFlowApproved(String flowNo) {
        HrLeaveRequest entity = findByFlowNo(flowNo);
        if (entity == null) {
            // 员工从 OA 中心直接发起的通用请假（未关联请假单据）：不动额度
            return;
        }
        if (HrLeaveConstants.STATUS_COMPLETED.equals(entity.getStatus())) {
            return;
        }
        entity.setStatus(HrLeaveConstants.STATUS_APPROVED);
        entity.setUpdatedAt(LocalDateTime.now());
        leaveMapper.updateById(entity);

        HrLeaveBalance balance = balanceMapper.selectOne(new LambdaQueryWrapper<HrLeaveBalance>()
                .eq(HrLeaveBalance::getUserId, entity.getUserId())
                .eq(HrLeaveBalance::getYear, entity.getYear())
                .eq(HrLeaveBalance::getLeaveType, entity.getLeaveType())
                .last("LIMIT 1"));
        String operator = operatorResolver.currentOperatorName();
        if (balance == null) {
            // 未授予额度也记录使用量（自动建 0 额度行），使超额在台账可见
            balance = new HrLeaveBalance();
            balance.setUserId(entity.getUserId());
            balance.setEmpNo(entity.getEmpNo());
            balance.setYear(entity.getYear());
            balance.setLeaveType(entity.getLeaveType());
            balance.setTotalDays(BigDecimal.ZERO);
            balance.setCarriedDays(BigDecimal.ZERO);
            balance.setUsedDays(BigDecimal.ZERO);
            balance.setRemark("未授予額度，由請假單自動建立");
            balance.setCreatedBy(operator);
            balance.setUpdatedBy(operator);
            balance.setDeleted(0);
            balanceMapper.insert(balance);
        }
        balance.setUsedDays(nz(balance.getUsedDays()).add(entity.getDays()));
        balance.setUpdatedBy(operator);
        balance.setUpdatedAt(LocalDateTime.now());
        balanceMapper.updateById(balance);

        entity.setStatus(HrLeaveConstants.STATUS_COMPLETED);
        entity.setRemark(trimRemark("請假辦理完成：" + leaveTypeName(entity.getLeaveType()) + " "
                + entity.getDays().stripTrailingZeros().toPlainString() + " 天已計入 " + entity.getYear() + " 年度額度"));
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        leaveMapper.updateById(entity);
        log.info("HR leave approved: reqNo={}, used +{}", entity.getReqNo(), entity.getDays());
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW,
            rollbackFor = Exception.class)
    public void onFlowRejected(String flowNo) {
        HrLeaveRequest entity = findByFlowNo(flowNo);
        if (entity == null || !HrLeaveConstants.STATUS_PENDING.equals(entity.getStatus())) {
            return;
        }
        entity.setStatus(HrLeaveConstants.STATUS_REJECTED);
        entity.setUpdatedBy(operatorResolver.currentOperatorName());
        entity.setUpdatedAt(LocalDateTime.now());
        leaveMapper.updateById(entity);
    }


    private HrLeaveRequest findByFlowNo(String flowNo) {
        if (!StringUtils.hasText(flowNo)) {
            return null;
        }
        List<HrLeaveRequest> list = leaveMapper.selectList(
                new LambdaQueryWrapper<HrLeaveRequest>().eq(HrLeaveRequest::getFlowNo, flowNo));
        return list.isEmpty() ? null : list.get(0);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private String trimRemark(String remark) {
        return remark != null && remark.length() > 500 ? remark.substring(0, 500) : remark;
    }

    /** 办理结果文案用字典名称，不暴露 LEAVE_TYPE 枚举码 */
    private String leaveTypeName(String code) {
        String name = dictService.getNameByCode(HrLeaveConstants.DICT_TYPE, code);
        return StringUtils.hasText(name) ? name : code;
    }
}
