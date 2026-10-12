package com.mftb.admin.service;

import com.mftb.admin.dto.AttendanceDailyVO;
import com.mftb.admin.dto.AttendanceMonthlyVO;
import com.mftb.admin.dto.PageResult;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 考勤汇总服务：日汇总计算、月度汇总生成与冻结。
 * <p>
 * 判定逻辑只允许存在一处：日报（日 × 考勤组）与月报（月 × 员工）都从同一份
 * 「人日结论」聚合出来。两边各写一套算法必然出现「日报对、月报错」而对不上账。
 */
public interface AttendanceSummaryService {

    /** 重算日汇总（含异常生成与打卡判定回写）；已冻结月份自动跳过 */
    Map<String, Object> recalculateDaily(LocalDate from, LocalDate to, Long groupId);

    /** 日报分页 */
    PageResult<AttendanceDailyVO> dailyPage(long page, long size, LocalDate from, LocalDate to,
                                            Long groupId, Long deptId);
    /** 日报统计（与列表同口径） */
    Map<String, Object> dailyStats(LocalDate from, LocalDate to, Long groupId, Long deptId);

    /** 生成/刷新月度汇总（只重建 draft 行，已冻结与已同步不动） */
    Map<String, Object> generateMonthly(String month, Long groupId);

    /** 月报分页 */
    PageResult<AttendanceMonthlyVO> monthlyPage(long page, long size, String month,
                                                Long groupId, Long deptId, String keyword, String status);

    /** 月报统计（与列表同口径） */
    Map<String, Object> monthlyStats(String month, Long groupId, Long deptId, String keyword, String status);

    /** 冻结：draft → frozen，生成批次号 */
    Map<String, Object> freeze(List<Long> ids);

    /** 同步薪酬：frozen → synced */
    Map<String, Object> syncToPayroll(List<Long> ids);

    /** 某月是否已冻结（界面预警与重算前置判断用） */
    boolean isMonthFrozen(String month);
}
