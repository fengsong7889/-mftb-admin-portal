package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PayrollPayslipDetailVO;
import com.mftb.admin.dto.PayrollPayslipVO;
import com.mftb.admin.entity.PayrollRun;

/**
 * 核算批次服務（D3 第三批）：試算 → 鎖定。
 * <p>
 * 試算可反覆做（先清後寫），鎖定後不可再算。缺少薪酬標準會整批拒絕，
 * 缺參保不阻斷但記錄警告——"沒參保"是一個明確事實，不是猜測。
 */
public interface PayrollRunService {

    PageResult<PayrollRun> listRuns(long page, long size, String period, String cityCode, String status);

    PayrollRun getRun(Long id);

    /** 建立批次：解析城市規則集（缺配置即拒絕），同城同月不得重複 */
    PayrollRun createRun(PayrollRun entity);

    /** 試算：按期間取薪酬標準與參保，逐人生成工資單 */
    PayrollRun calculate(Long runId);

    /** 鎖定：鎖定後不可重算 */
    PayrollRun lock(Long runId);

    /** 刪除：僅草稿批次可刪 */
    void deleteRun(Long id);

    PageResult<PayrollPayslipVO> listPayslips(Long runId, long page, long size);

    PayrollPayslipDetailVO getPayslipDetail(Long payslipId);
}
