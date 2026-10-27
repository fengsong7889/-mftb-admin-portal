package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PayrollEnrollmentVO;
import com.mftb.admin.entity.PayrollBenefitPlan;
import com.mftb.admin.entity.PayrollEnrollment;

import java.time.LocalDate;

/**
 * 福利參保服務（D2 第三批）：參保方案 + 人員參保。
 * <p>
 * 方案负责"这类福利按什么费率、基数上下限多少"，参保负责"某段雇佣按哪个方案、按多少基数"。
 * 两层分开是因为费率随政策调整，而个人的参保事实不应随之被改写。
 */
public interface PayrollBenefitService {

    PageResult<PayrollBenefitPlan> listPlans(long page, long size, String keyword, String planType,
                                            String jurisdiction, Integer status);

    PayrollBenefitPlan getPlan(Long id);

    PayrollBenefitPlan savePlan(PayrollBenefitPlan entity);

    void deletePlan(Long id);

    PageResult<PayrollEnrollmentVO> listEnrollments(long page, long size, Long employmentId, Long planId,
                                                    LocalDate asOf, Boolean activeOnly);

    PayrollEnrollment getEnrollment(Long id);

    /** 参保保存：校验方案有效期与基数区间，并按方案费率快照计算雇主/雇员金额 */
    PayrollEnrollment saveEnrollment(PayrollEnrollment entity);

    void deleteEnrollment(Long id);
}
