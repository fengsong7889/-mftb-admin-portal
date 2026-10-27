package com.mftb.admin.util;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * 日期时间格式化工具: 接口输出统一为 yyyy-MM-dd HH:mm:ss / yyyy-MM-dd 字符串
 */
public final class DateTimeUtils {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private DateTimeUtils() {
    }

    /** 格式化日期时间，空值返回 null */
    public static String format(LocalDateTime value) {
        return value == null ? null : value.format(DATE_TIME);
    }

    /** 格式化日期，空值返回 null */
    public static String format(LocalDate value) {
        return value == null ? null : value.format(DATE);
    }
}
