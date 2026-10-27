package com.mftb.admin.service;

import com.mftb.admin.dto.ProfileDiffReportVO;

import java.time.LocalDate;

/**
 * 雇佣数据差异报告：把「账号快照 / 任职事实 / 雇佣期间」三份数据对不上的地方枚举出来。
 * <p>
 * 它是历史数据迁移的<b>前置门禁产物</b>（方案 §7.1「差异清单由 HR 确认冲突来源」），
 * 本身只读、不修数据 —— 谁都能点，点了不会改任何东西，这才是能交给 HR 反复核对的报告。
 */
public interface HrProfileDiffService {

    /** 以今天为口径日生成报告 */
    default ProfileDiffReportVO report() {
        return report(LocalDate.now());
    }

    /**
     * 生成报告。
     * <p>扫描范围强制收敛在操作者的组织数据范围内：持有 employee-management 不等于能看全公司，
     * 「HR 只能看自己那条线」时报告里也只有那几个人。
     *
     * @param asOf 口径日（null 按今天）
     */
    ProfileDiffReportVO report(LocalDate asOf);
}
