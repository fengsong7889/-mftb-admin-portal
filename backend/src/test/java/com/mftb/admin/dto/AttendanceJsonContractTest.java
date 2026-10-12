package com.mftb.admin.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.config.JacksonConfig;
import com.mftb.admin.entity.AttException;
import com.mftb.admin.entity.AttShift;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 考勤域 JSON 契约锁。
 * <p>
 * 为什么单独测序列化形态：{@code AttShift} 是全仓唯一把 {@code LocalTime} 直接暴露给前端的实体
 * （其它模块的时间字段都是 LocalDateTime 或 String）。Jackson 对 java.time 类型的输出形态取决于
 * {@code WRITE_DATES_AS_TIMESTAMPS}：开启时 LocalTime 会变成 {@code [9,0]} 数组，
 * 前端 TimePicker 直接崩，而这种错误在 Java 侧编译期与运行期都看不出来。
 * <p>
 * 本用例用与生产同一套配置（{@link JacksonConfig} 定制器 + Spring Boot 默认关闭时间戳写日期
 * + {@code default-property-inclusion: non_null}）把形态钉死，前端才能安全按字符串解析。
 */
class AttendanceJsonContractTest {

    private static ObjectMapper mapper;

    @BeforeAll
    static void buildMapper() {
        Jackson2ObjectMapperBuilder builder = new Jackson2ObjectMapperBuilder()
                .serializationInclusion(JsonInclude.Include.NON_NULL);
        // 与生产一致：Spring Boot 自动配置会关掉它，Jackson2ObjectMapperBuilder 默认也关掉，
        // 这里显式声明避免有人换构建方式后形态静默变化
        builder.featuresToDisable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        new JacksonConfig().jacksonCustomizer().customize(builder);
        mapper = builder.build();
    }

    @Test
    @DisplayName("班次的时间字段以 ISO 字符串下发，而不是数组或时间戳")
    void shiftTimesSerializeAsIsoStrings() throws Exception {
        AttShift shift = new AttShift();
        shift.setId(1L);
        shift.setShiftCode("SH01");
        shift.setShiftName("標準白班 09:00-18:00");
        shift.setOnTime(LocalTime.of(9, 0));
        shift.setOffTime(LocalTime.of(18, 0));
        shift.setWorkHours(new BigDecimal("8.0"));
        shift.setCrossDay(0);
        shift.setFlexFlag(0);
        shift.setStatus("enabled");

        String json = mapper.writeValueAsString(shift);

        assertTrue(json.contains("\"onTime\":\"09:00:00\""), "onTime 必须是字符串，实际: " + json);
        assertTrue(json.contains("\"offTime\":\"18:00:00\""), "offTime 必须是字符串，实际: " + json);
        assertFalse(json.contains("\"onTime\":["), "LocalTime 一旦输出成数组，前端 TimePicker 无法解析");
        // non_null 生效：未设置的备注不该出现，前端类型可按可选字段处理
        assertFalse(json.contains("\"remark\""), "空字段应被 non_null 策略省略");
    }

    @Test
    @DisplayName("前端 TimePicker 提交的 HH:mm（无秒）能被反序列化")
    void shiftAcceptsHourMinuteOnlyInput() throws Exception {
        String payload = "{\"shiftCode\":\"SH09\",\"shiftName\":\"門店晚班\",\"onTime\":\"13:00\","
                + "\"offTime\":\"22:00\",\"workHours\":8,\"crossDay\":0,\"flexFlag\":0,\"status\":\"enabled\"}";

        AttShift parsed = mapper.readValue(payload, AttShift.class);

        assertEquals(LocalTime.of(13, 0), parsed.getOnTime(), "缺秒的时间必须能解析，否则班次表单提交即 400");
        assertEquals(LocalTime.of(22, 0), parsed.getOffTime());
    }

    @Test
    @DisplayName("跨天夜班与弹性班次的时间可为空，且不会因缺字段报错")
    void shiftToleratesMissingTimes() throws Exception {
        String payload = "{\"shiftCode\":\"SH05\",\"shiftName\":\"自由工時\",\"flexFlag\":1,\"status\":\"enabled\"}";

        AttShift parsed = mapper.readValue(payload, AttShift.class);

        assertEquals(1, parsed.getFlexFlag());
        assertTrue(parsed.getOnTime() == null, "弹性班次不填上下班时间");
    }

    @Test
    @DisplayName("班次视图把时间收敛成 HH:mm，更新时间给可读字符串")
    void shiftVoNormalizesTimesForFormBinding() throws Exception {
        AttShift shift = new AttShift();
        shift.setId(2L);
        shift.setShiftCode("SH02");
        shift.setShiftName("門店早班");
        shift.setOnTime(LocalTime.of(8, 0));
        shift.setOffTime(LocalTime.of(17, 0));
        shift.setRestStart(LocalTime.of(12, 0));
        shift.setRestEnd(LocalTime.of(13, 0));
        shift.setWorkHours(new BigDecimal("8.0"));
        shift.setCrossDay(0);
        shift.setFlexFlag(0);
        shift.setStatus("enabled");
        shift.setUpdatedBy("李大偉");
        shift.setUpdatedAt(LocalDateTime.of(2026, 9, 12, 14, 5, 0));

        String json = mapper.writeValueAsString(AttendanceShiftVO.of(shift));

        // 界面 TimePicker 的显示格式是 HH:mm：多下发一个秒会让“改了没生效”看起来像 bug
        assertTrue(json.contains("\"onTime\":\"08:00\""), "VO 时间应为 HH:mm: " + json);
        assertTrue(json.contains("\"offTime\":\"17:00\""));
        assertTrue(json.contains("\"restStart\":\"12:00\""));
        assertTrue(json.contains("\"updatedAt\":\"2026-09-12 14:05:00\""), "列表的时间列不能是毫秒时间戳: " + json);
    }

    @Test
    @DisplayName("节假日视图日期为 ISO 字符串、更新时间为可读字符串")
    void holidayVoKeepsDateAndTimeReadable() throws Exception {
        com.mftb.admin.entity.AttHoliday holiday = new com.mftb.admin.entity.AttHoliday();
        holiday.setId(3L);
        holiday.setHolidayDate(java.time.LocalDate.of(2026, 10, 1));
        holiday.setHolidayName("國慶日");
        holiday.setHolidayType(com.mftb.admin.entity.AttHoliday.TYPE_LEGAL);
        holiday.setYearNo(2026);
        holiday.setStatus("enabled");
        holiday.setUpdatedAt(LocalDateTime.of(2026, 8, 1, 10, 12, 0));

        String json = mapper.writeValueAsString(AttendanceHolidayVO.of(holiday));

        assertTrue(json.contains("\"holidayDate\":\"2026-10-01\""), "日期应为 ISO 字符串: " + json);
        assertTrue(json.contains("\"updatedAt\":\"2026-08-01 10:12:00\""), json);
        assertTrue(json.contains("\"holidayType\":1"));
    }

    @Test
    @DisplayName("实体的 LocalDateTime 是毫秒时间戳，因此面向人的视图必须走 VO 字符串")
    void entityTimestampsAreNumbersButVoTimesAreStrings() throws Exception {
        AttException entity = new AttException();
        entity.setId(1L);
        entity.setWorkDate(java.time.LocalDate.of(2026, 10, 8));
        entity.setExceptionType(AttException.TYPE_LATE);
        entity.setDetail("遲到 23 分鐘");
        entity.setStatus(AttException.STATUS_HANDLED);
        entity.setHandler("陳小紅");
        entity.setHandledAt(LocalDateTime.of(2026, 10, 8, 9, 30, 0));
        entity.setHandleRemark("忘記打卡，已補錄");

        String entityJson = mapper.writeValueAsString(entity);
        String voJson = mapper.writeValueAsString(AttendanceExceptionVO.of(entity));

        // 实体：时间戳数字（接口间传值稳定，但界面上是一串数字）
        assertTrue(entityJson.matches("(?s).*\"handledAt\":\\d+.*"), "实体时间应为毫秒时间戳: " + entityJson);
        // VO：可读字符串，且处理说明与判定明细分列下发
        assertTrue(voJson.contains("\"handledAt\":\"2026-10-08 09:30:00\""), "VO 时间必须是可读字符串: " + voJson);
        assertTrue(voJson.contains("\"handleRemark\":\"忘記打卡，已補錄\""));
        assertTrue(voJson.contains("\"detail\":\"遲到 23 分鐘\""));
        assertTrue(voJson.contains("\"workDate\":\"2026-10-08\""), "LocalDate 应为 ISO 日期字符串");
    }
}
