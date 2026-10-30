package com.mftb.admin.service.minutes;

import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 相对/绝对期限解析：基准是会议日期（不是录入当天），解决会后补录「本周五」漂移。
 *
 * <p>只处理口径明确的表达；模糊（尽快、月底前、周五无周次）一律返回 {@code unresolved}，
 * 交界面标注待确认，绝不替用户猜一个看似确定的日期。解析结果可能是过去日（逾期），
 * 由上层给提醒而不是自动顺延。
 */
@Component
public class MinutesRelativeDateParser {

    public enum Kind { RESOLVED, UNRESOLVED }

    /** 解析结论：RESOLVED 带日期；UNRESOLVED 带原因码（vague / none）。 */
    public record Result(Kind kind, LocalDate date, String reasonCode) {
        static Result resolved(LocalDate date) {
            return new Result(Kind.RESOLVED, date, null);
        }

        static Result unresolved(String reasonCode) {
            return new Result(Kind.UNRESOLVED, null, reasonCode);
        }
    }

    private static final Pattern ABSOLUTE = Pattern.compile("(\\d{4})[年/.-](\\d{1,2})[月/.-](\\d{1,2})日?");
    private static final Pattern PLUS_DAYS = Pattern.compile("(\\d+)\\s*(?:個?天|日|days?|d)後");
    private static final Pattern WEEKDAY = Pattern.compile("(本|這|下|上)(?:周|週|星期|礼拜)([一二三四五六日天])");
    private static final Pattern BARE_WEEKDAY = Pattern.compile("(?:周|週|星期|礼拜)([一二三四五六日天])");
    private static final DateTimeFormatter STRICT =
            DateTimeFormatter.ofPattern("uuuu-M-d").withResolverStyle(ResolverStyle.STRICT);

    /** 明确无期限的口语词：不猜日期。 */
    private static boolean isVague(String text) {
        return text.matches(".*(盡快|尽快|尽快|稍後|稍后|近期|盡快處理|待定|擇日|月底前|月底|原則上).*");
    }

    private static int weekdayOf(String cn) {
        return switch (cn) {
            case "一", "1" -> DayOfWeek.MONDAY.getValue();
            case "二", "2" -> DayOfWeek.TUESDAY.getValue();
            case "三", "3" -> DayOfWeek.WEDNESDAY.getValue();
            case "四", "4" -> DayOfWeek.THURSDAY.getValue();
            case "五", "5" -> DayOfWeek.FRIDAY.getValue();
            case "六", "6" -> DayOfWeek.SATURDAY.getValue();
            default -> DayOfWeek.SUNDAY.getValue();
        };
    }

    /**
     * @param dueText     模型给出的原始期限表达（可能为空）
     * @param meetingDate 会议基准日期（LocalDate，业务时区下的日历日）
     */
    public Result parse(String dueText, LocalDate meetingDate) {
        if (!StringUtils.hasText(dueText)) {
            return Result.unresolved("none");
        }
        String text = dueText.trim();

        Matcher abs = ABSOLUTE.matcher(text);
        if (abs.find()) {
            try {
                LocalDate date = LocalDate.parse(
                        abs.group(1) + "-" + Integer.parseInt(abs.group(2)) + "-" + Integer.parseInt(abs.group(3)), STRICT);
                return Result.resolved(date);
            } catch (DateTimeParseException | NumberFormatException e) {
                return Result.unresolved("invalid_date");
            }
        }

        Matcher plus = PLUS_DAYS.matcher(text);
        if (plus.find()) {
            return Result.resolved(meetingDate.plusDays(Long.parseLong(plus.group(1))));
        }

        if (text.contains("今天") || text.contains("今日")) {
            return Result.resolved(meetingDate);
        }
        if (text.contains("明天") || text.contains("明日")) {
            return Result.resolved(meetingDate.plusDays(1));
        }
        if (text.contains("后天") || text.contains("後天")) {
            return Result.resolved(meetingDate.plusDays(2));
        }

        Matcher week = WEEKDAY.matcher(text);
        if (week.find()) {
            int target = weekdayOf(week.group(2));
            LocalDate base = switch (week.group(1)) {
                case "下" -> meetingDate.with(TemporalAdjusters.next(DayOfWeek.MONDAY));
                case "上" -> meetingDate.with(TemporalAdjusters.previous(DayOfWeek.MONDAY));
                default -> meetingDate.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            };
            LocalDate date = base.with(TemporalAdjusters.nextOrSame(DayOfWeek.of(target)));
            if ("上".equals(week.group(1))) {
                date = base.with(TemporalAdjusters.previousOrSame(DayOfWeek.of(target)));
            }
            return Result.resolved(date);
        }

        // 只有「周五」没有周次：口径歧义，不静默选下周
        if (BARE_WEEKDAY.matcher(text).find()) {
            return Result.unresolved("ambiguous_weekday");
        }
        if (isVague(text)) {
            return Result.unresolved("vague");
        }
        return Result.unresolved("unrecognized");
    }

    static String normalize(String text) {
        return text == null ? "" : text.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }
}
