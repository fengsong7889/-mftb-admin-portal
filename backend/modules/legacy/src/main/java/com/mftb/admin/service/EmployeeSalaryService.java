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

    /** 列出该用户的全部收入项，按创建时间升序；用户不存在时报错 */
    List<SalaryIncomeVO> listIncomes(Long userId);

    /** 新增收入项，写入时绑定到 userId，不接受调用方指定其他归属人 */
    SalaryIncomeVO createIncome(Long userId, SalaryIncomeRequest request);

    /**
     * 更新收入项。
     * <p>
     * 服务端会校验该 incomeId 确实属于 userId；<b>越权与记录不存在共用同一提示
     * “收入項不存在”</b>，故意不区分，以免探测他人记录是否存在。
     */
    SalaryIncomeVO updateIncome(Long userId, Long incomeId, SalaryIncomeRequest request);

    /** 删除收入项；归属校验与措辞同 {@link #updateIncome} */
    void deleteIncome(Long userId, Long incomeId);

    // ── 扣除项 ──

    /** 列出该用户的全部扣除项，按创建时间升序；用户不存在时报错 */
    List<SalaryDeductionVO> listDeductions(Long userId);

    /** 新增扣除项，写入时绑定到 userId */
    SalaryDeductionVO createDeduction(Long userId, SalaryDeductionRequest request);

    /** 更新扣除项；归属校验与“不存在”统一措辞同 {@link #updateIncome} */
    SalaryDeductionVO updateDeduction(Long userId, Long deductionId, SalaryDeductionRequest request);

    /** 删除扣除项；归属校验与措辞同 {@link #updateIncome} */
    void deleteDeduction(Long userId, Long deductionId);

    // ── 薪资配置 ──

    /** 获取薪资配置（未配置时返回字段为空的 VO） */
    SalaryConfigVO getConfig(Long userId);

    /** 保存薪资配置（存在则更新，不存在则新建） */
    SalaryConfigVO saveConfig(Long userId, SalaryConfigRequest request);
}
