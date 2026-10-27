package com.mftb.admin.service;

import com.mftb.admin.entity.HrEmploymentPeriod;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 雇佣期间服务（方案 §7.1 员工主档分层，P4 双轨第一阶段）。
 * <p>
 * 双轨期间的定位是「旁路投影」：人事列表/详情仍以 {@code sys_user} 快照 + as-of 任职解析为准，
 * 本表由任职事实派生、经 HR 核对后登记。派生口径全部集中在 {@code HrEmploymentPeriodCalculator}，
 * 本接口只暴露读取与「按事实登记/修复」两个动作。
 */
public interface HrEmploymentPeriodService {

    /** 按任职事实派生该员工的雇佣期间（只读，不落库） */
    List<HrEmploymentPeriod> derive(Long userId, LocalDate asOf);

    /**
     * 按任职事实登记/修复雇佣期间（幂等，可重复执行）。
     * <p>只补不猜：人工确认过的入职日（{@code MANUAL}）不会被派生值覆盖；无起点锚点时什么都不写。
     *
     * @return 本次落库的段数
     */
    int syncFromRecords(Long userId, String operator);

    /** 该员工已登记的雇佣期间（按 periodSeq 升序） */
    List<HrEmploymentPeriod> listByUser(Long userId);

    /** 指定时点生效的那一段 */
    Optional<HrEmploymentPeriod> currentPeriod(Long userId, LocalDate asOf);

    /**
     * 批量读取（差异报告用）：避开一人一次查询的 N+1。
     *
     * @return userId → 已登记段（无段的员工不出现在结果里）
     */
    Map<Long, List<HrEmploymentPeriod>> listByUsers(Collection<Long> userIds);
}
