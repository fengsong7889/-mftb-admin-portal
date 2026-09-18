package com.mftb.admin.service;

import com.mftb.admin.dto.SalaryConfigRequest;
import com.mftb.admin.dto.SalaryConfigVO;
import com.mftb.admin.dto.SalaryDeductionRequest;
import com.mftb.admin.dto.SalaryDeductionVO;
import com.mftb.admin.dto.SalaryIncomeRequest;
import com.mftb.admin.dto.SalaryIncomeVO;

import java.util.List;

/**
 * 员工费用信息服务（收入项 / 扣除项 / 薪资配置）
 */
public interface EmployeeSalaryService {

    // ── 收入项 ──

    List<SalaryIncomeVO> listIncomes(Long userId);

    SalaryIncomeVO createIncome(Long userId, SalaryIncomeRequest request);

    SalaryIncomeVO updateIncome(Long userId, Long incomeId, SalaryIncomeRequest request);

    void deleteIncome(Long userId, Long incomeId);

    // ── 扣除项 ──

    List<SalaryDeductionVO> listDeductions(Long userId);

    SalaryDeductionVO createDeduction(Long userId, SalaryDeductionRequest request);

    SalaryDeductionVO updateDeduction(Long userId, Long deductionId, SalaryDeductionRequest request);

    void deleteDeduction(Long userId, Long deductionId);

    // ── 薪资配置 ──

    /** 获取薪资配置（未配置时返回字段为空的 VO） */
    SalaryConfigVO getConfig(Long userId);

    /** 保存薪资配置（存在则更新，不存在则新建） */
    SalaryConfigVO saveConfig(Long userId, SalaryConfigRequest request);
}
