package com.mftb.admin.service;

import com.mftb.admin.dto.AttendanceScheduleSaveRequest;
import com.mftb.admin.dto.AttendanceScheduleVO;

import java.time.LocalDate;
import java.util.Map;

/**
 * 考勤排班服务（员工 × 日期 × 班次）。
 */
public interface AttendanceScheduleService {

    /** 周矩阵视图（含该周内的成员归属，历史周按当时归属出数） */
    AttendanceScheduleVO week(Long groupId, LocalDate weekStart);

    /** 批量保存排班：按 (userId, workDate) upsert，未提及的格子不动 */
    Map<String, Object> save(AttendanceScheduleSaveRequest request);

    /** 复制整周排班到目标周 */
    Map<String, Object> copyWeek(Long groupId, LocalDate sourceWeekStart, LocalDate targetWeekStart);

    /** 周排班覆盖统计：人数 / 已排格 / 休息格 / 整周未排班人数 */
    Map<String, Object> stats(Long groupId, LocalDate weekStart);
}
