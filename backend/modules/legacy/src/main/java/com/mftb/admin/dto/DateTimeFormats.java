package com.mftb.admin.dto;

import com.mftb.admin.common.BusinessException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoField;

/**
 * 时间格式化小工具：视图层统一输出 {@code yyyy-MM-dd HH:mm:ss}。
 * <p>为什么不让实体直接带格式化注解：全局 Jackson 已把 LocalDateTime 配成毫秒时间戳
 * （接口间传值更稳），只有面向人的视图才需要可读形态。
 */
public final class DateTimeFormats {

    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /**
     * 入参解析器：秒可缺省（TimePicker 只选到分时是常见形态）。
     */
    private static final DateTimeFormatter LENIENT = new DateTimeFormatterBuilder()
            .appendPattern("yyyy-MM-dd HH:mm")
            .optionalStart().appendPattern(":ss").optionalEnd()
            .parseDefaulting(ChronoField.SECOND_OF_MINUTE, 0)
            .toFormatter();

    private DateTimeFormats() {
    }

    public static String of(LocalDateTime value) {
        return value == null ? null : value.format(DATE_TIME);
    }

    /**
     * 宽容解析前端提交的时间：同时收 {@code yyyy-MM-dd HH:mm[:ss]} 与 ISO 的 {@code yyyy-MM-ddTHH:mm[:ss]}。
     * <p>为什么两种都收：全局 Jackson 只把 LocalDateTime 序列化成时间戳，反序列化走默认 ISO 解析，
     * 而界面控件回填的是空格分隔格式；只认一种必然在某个页面上 400。
     *
     * @return 解析结果；{@code text} 为空时返回 null（是否必填由调用方按业务判定）
     * @throws BusinessException 格式不合法；消息只回显提交值，不带堆栈与内部路径
     */
    public static LocalDateTime parse(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String normalized = text.trim().replace('T', ' ');
        int dot = normalized.indexOf('.');
        if (dot > 0) {
            // 去掉毫秒尾巴（dayjs 的 toISOString 会带）
            normalized = normalized.substring(0, dot);
        }
        try {
            return LocalDateTime.parse(normalized, LENIENT);
        } catch (DateTimeParseException e) {
            throw new BusinessException("時間格式不合法，應為 yyyy-MM-dd HH:mm:ss：" + text);
        }
    }
}
