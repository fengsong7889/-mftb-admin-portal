package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.PayrollComponent;
import com.mftb.admin.entity.PayrollSalaryStandard;

import java.time.LocalDate;

/**
 * 薪酬基础服务（D2 第一批）：薪酬项目字典 + 薪酬标准（定调薪，日期生效）。
 * <p>
 * 本批不接核算：核算引擎（试算/复核/锁定）是 D3，先把"项目口径"和"每段雇佣的工资标准"立住，
 * 否则 D3 的试算没有可信输入。
 */
public interface PayrollService {

    PageResult<PayrollComponent> listComponents(long page, long size, String keyword, String componentType, Integer status);

    PayrollComponent getComponent(Long id);

    /** 新增或编辑薪酬项目：类型白名单、应税标记、币种格式 */
    PayrollComponent saveComponent(PayrollComponent entity);

    void deleteComponent(Long id);

    PageResult<PayrollSalaryStandard> listStandards(Long employmentId, LocalDate asOf, long page, long size);

    PayrollSalaryStandard getStandard(Long id);

    /** 新增或编辑薪酬标准：金额非负、币种必填、区间不重叠、同一天多次靠 seqNo 排序 */
    PayrollSalaryStandard saveStandard(PayrollSalaryStandard entity);

    void deleteStandard(Long id);
}
