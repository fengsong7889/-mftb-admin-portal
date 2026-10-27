package com.mftb.admin.dto;

import com.mftb.admin.entity.AttDaySummary;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 考勤日报视图（日期 × 考勤组的计算结论，只读）。
 * <p>
 * 不含任何可写字段：日报是计算结果，界面上不该出现能让人误以为可以改数的入口。
 */
@Data
public class AttendanceDailyVO {

    private Long id;
    private LocalDate workDate;
    private Long groupId;
    private String groupName;
    private Long deptId;
    private String deptName;
    private Integer shouldCount;
    private Integer actualCount;
    private Integer lateCount;
    private Integer earlyCount;
    private Integer missingCount;
    private Integer absentCount;
    private Integer leaveCount;
    private BigDecimal overtimeHours;
    private BigDecimal attendRate;
    /** 本次汇总生成时间：重算的审计凭据 */
    private String calculatedAt;

    public static AttendanceDailyVO of(AttDaySummary e) {
        AttendanceDailyVO vo = new AttendanceDailyVO();
        vo.setId(e.getId());
        vo.setWorkDate(e.getWorkDate());
        vo.setGroupId(e.getGroupId());
        vo.setGroupName(e.getGroupName());
        vo.setDeptId(e.getDeptId());
        vo.setDeptName(e.getDeptName());
        vo.setShouldCount(e.getShouldCount());
        vo.setActualCount(e.getActualCount());
        vo.setLateCount(e.getLateCount());
        vo.setEarlyCount(e.getEarlyCount());
        vo.setMissingCount(e.getMissingCount());
        vo.setAbsentCount(e.getAbsentCount());
        vo.setLeaveCount(e.getLeaveCount());
        vo.setOvertimeHours(e.getOvertimeHours());
        vo.setAttendRate(e.getAttendRate());
        vo.setCalculatedAt(DateTimeFormats.of(e.getCalculatedAt()));
        return vo;
    }
}
