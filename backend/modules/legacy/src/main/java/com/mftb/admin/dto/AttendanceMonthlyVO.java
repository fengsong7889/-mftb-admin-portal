package com.mftb.admin.dto;

import com.mftb.admin.entity.AttMonthlySummary;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 月度考勤汇总视图——薪酬核算系统的取数出口。
 * <p>
 * 工时与天数一律 BigDecimal 原样透出，不在视图层做四舍五入：薪酬侧按自己的规则进位，
 * 这里先舍一次会造成两边对不上账。
 */
@Data
public class AttendanceMonthlyVO {

    private Long id;
    /** yyyy-MM */
    private String statMonth;
    /** 冻结时生成的批次号，薪酬按此对账 */
    private String batchNo;
    private Long userId;
    private String empNo;
    private String empName;
    private Long deptId;
    private String deptName;
    private Long groupId;
    private String groupName;
    private BigDecimal shouldDays;
    private BigDecimal actualDays;
    private Integer lateTimes;
    private Integer lateMinutes;
    private Integer earlyTimes;
    private Integer missingTimes;
    private BigDecimal absentDays;
    private BigDecimal annualDays;
    private BigDecimal sickDays;
    private BigDecimal personalDays;
    private BigDecimal workdayOtHours;
    private BigDecimal restdayOtHours;
    private BigDecimal holidayOtHours;
    private BigDecimal attendRate;
    /** draft 待確認 / frozen 已凍結 / synced 已同步薪酬 */
    private String status;
    private String frozenBy;
    private String frozenAt;
    private String syncedAt;
    private String updatedBy;
    private String updatedAt;

    public static AttendanceMonthlyVO of(AttMonthlySummary e) {
        AttendanceMonthlyVO vo = new AttendanceMonthlyVO();
        vo.setId(e.getId());
        vo.setStatMonth(e.getStatMonth());
        vo.setBatchNo(e.getBatchNo());
        vo.setUserId(e.getUserId());
        vo.setEmpNo(e.getEmpNo());
        vo.setEmpName(e.getEmpName());
        vo.setDeptId(e.getDeptId());
        vo.setDeptName(e.getDeptName());
        vo.setGroupId(e.getGroupId());
        vo.setGroupName(e.getGroupName());
        vo.setShouldDays(e.getShouldDays());
        vo.setActualDays(e.getActualDays());
        vo.setLateTimes(e.getLateTimes());
        vo.setLateMinutes(e.getLateMinutes());
        vo.setEarlyTimes(e.getEarlyTimes());
        vo.setMissingTimes(e.getMissingTimes());
        vo.setAbsentDays(e.getAbsentDays());
        vo.setAnnualDays(e.getAnnualDays());
        vo.setSickDays(e.getSickDays());
        vo.setPersonalDays(e.getPersonalDays());
        vo.setWorkdayOtHours(e.getWorkdayOtHours());
        vo.setRestdayOtHours(e.getRestdayOtHours());
        vo.setHolidayOtHours(e.getHolidayOtHours());
        vo.setAttendRate(e.getAttendRate());
        vo.setStatus(e.getStatus());
        vo.setFrozenBy(e.getFrozenBy());
        vo.setFrozenAt(DateTimeFormats.of(e.getFrozenAt()));
        vo.setSyncedAt(DateTimeFormats.of(e.getSyncedAt()));
        vo.setUpdatedBy(e.getUpdatedBy());
        vo.setUpdatedAt(DateTimeFormats.of(e.getUpdatedAt()));
        return vo;
    }
}
