package com.mftb.admin.dto;

import lombok.Data;

/**
 * 考勤异常人工补录请求。
 * <p>
 * 时间字段用 String 收：界面 TimePicker 回填的是 {@code yyyy-MM-dd HH:mm:ss}，
 * 而全局 Jackson 反序列化只认 ISO 的 {@code T} 分隔，直接用 LocalDateTime 接会在补卡页 400。
 * 由 {@link DateTimeFormats#parse(String)} 统一宽容解析，格式错误抛业务异常而不是 500。
 * <p>
 * 不接收 {@code workDate}：考勤日期以异常行为准，让前端传日期就等于允许把卡补到别的月份，
 * 绕过冻结检查。
 */
@Data
public class AttendanceExceptionReissueRequest {

    /** 补上班卡时间（必填） */
    private String onTime;

    /** 补下班卡时间（选填；跨天夜班允许落到次日凌晨） */
    private String offTime;

    /** 补卡原因（必填，唯一的合规依据） */
    private String reason;
}
