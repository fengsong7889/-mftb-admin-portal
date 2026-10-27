package com.mftb.admin.dto;

import com.mftb.admin.entity.AttShift;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

/**
 * 班次视图。
 * <p>
 * 两处刻意与实体不同：
 * ① {@code onTime/offTime/restStart/restEnd} 输出 {@code HH:mm}——实体是 {@code LocalTime}，
 *    直接下发会变成 {@code "09:00:00"}，界面 TimePicker 显示格式是 {@code HH:mm}，
 *    多出来的秒对用户没有意义还会让"改了没生效"看起来像 bug；
 * ② {@code updatedAt} 输出可读字符串——全局 Jackson 把 LocalDateTime 序列化成毫秒时间戳，
 *    直接返回实体会让「最後更新時間」列显示一串数字。
 */
@Data
public class AttendanceShiftVO {

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    private Long id;
    private String shiftCode;
    private String shiftName;
    /** HH:mm；弹性班次为空 */
    private String onTime;
    /** HH:mm；弹性班次为空 */
    private String offTime;
    /** 1=下班时间落在次日（跨天夜班） */
    private Integer crossDay;
    private BigDecimal workHours;
    private String restStart;
    private String restEnd;
    /** 1=弹性工时（不判定迟到早退） */
    private Integer flexFlag;
    private String status;
    private String remark;
    private String updatedBy;
    private String updatedAt;

    public static AttendanceShiftVO of(AttShift e) {
        AttendanceShiftVO vo = new AttendanceShiftVO();
        vo.setId(e.getId());
        vo.setShiftCode(e.getShiftCode());
        vo.setShiftName(e.getShiftName());
        vo.setOnTime(hhmm(e.getOnTime()));
        vo.setOffTime(hhmm(e.getOffTime()));
        vo.setCrossDay(e.getCrossDay());
        vo.setWorkHours(e.getWorkHours());
        vo.setRestStart(hhmm(e.getRestStart()));
        vo.setRestEnd(hhmm(e.getRestEnd()));
        vo.setFlexFlag(e.getFlexFlag());
        vo.setStatus(e.getStatus());
        vo.setRemark(e.getRemark());
        vo.setUpdatedBy(e.getUpdatedBy());
        vo.setUpdatedAt(DateTimeFormats.of(e.getUpdatedAt()));
        return vo;
    }

    private static String hhmm(LocalTime value) {
        return value == null ? null : value.format(HH_MM);
    }
}
