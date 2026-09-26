package com.mftb.admin.service;

import com.mftb.admin.dto.HrLeaveBalanceVO;
import com.mftb.admin.dto.HrLeaveRequestSaveDTO;
import com.mftb.admin.dto.HrLeaveRequestVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrLeaveBalance;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * HR 假期服务：额度台账（hr_leave_balance）+ 请假申请（hr_leave_request，审批走 OA 引擎）。
 */
public interface HrLeaveService {

    /**
     * 额度台账分页（按年度 + 员工关键字），未授予额度的假别不展示。
     *
     * @param mineOnly 只看本人（員工自助页）：即使调用者是人事角色也强制收敛为本人，
     *                 避免「我的假期」页对管理员呈现全员数据
     */
    PageResult<HrLeaveBalanceVO> balances(long page, long size, Integer year, String keyword, boolean mineOnly);

    /** 保存额度（新建或按 id 更新；used_days 只由审批回调累加，请求值一律忽略） */
    HrLeaveBalance saveBalance(HrLeaveBalance body);

    /** 删除额度记录（已有已用天数时禁止删除，避免丢失累计口径） */
    void deleteBalance(Long id);

    /**
     * 批量初始化年度额度：为在职员工按假别建额度行（已存在的组合跳过）。
     *
     * @param userIds 为空表示全部在职员工
     * @return 新建行数
     */
    int batchInit(Integer year, String leaveType, BigDecimal totalDays, java.util.List<Long> userIds);

    /** 请假人选下拉（在职员工，供请假表单选人；含各假别剩余额度由前端另查） */
    List<Map<String, Object>> employeeOptions(String keyword);

    /**
     * 单员工 × 单假别的剩余额度（供请假表单实时提示，避免前端翻页匹配）。
     *
     * @param year 为空时取当前年度
     * @return {granted: 是否已授予额度, remainingDays: 剩余可用天数（未授予时为 null）}
     */
    Map<String, Object> quota(Long userId, String leaveType, Integer year);

    /** 指定年度剩余额度为负（超额）的额度行数；跨分页口径，供台账预警 */
    long overdueCount(Integer year);

    /** 请假单分页（状态 + 关键字）；mineOnly 同上，自助页强制本人 */
    PageResult<HrLeaveRequestVO> page(long page, long size, String status, String keyword, boolean mineOnly);

    /** 请假单各状态数量（列表 Tab 徽标），含 all；须与 page 同口径（mineOnly 一致） */
    Map<String, Long> stats(boolean mineOnly);

    /** 请假单详情 */
    HrLeaveRequestVO detail(Long id);

    /** 保存草稿（天数按起止日期服务端计算并校验额度） */
    HrLeaveRequestVO saveDraft(HrLeaveRequestSaveDTO dto);

    /** 编辑草稿/驳回/已撤销单据 */
    HrLeaveRequestVO update(Long id, HrLeaveRequestSaveDTO dto);

    /** 提交审批（创建关联 OA 流程） */
    HrLeaveRequestVO submit(Long id);

    /** 撤销审批（单据回草稿，联动撤销在途 OA 流程） */
    void cancel(Long id);

    /** 删除单据（仅草稿/驳回/已撤销） */
    void delete(Long id);
}
