package com.mftb.admin.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.StdSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Jackson 全局配置：
 * - LocalDateTime 序列化为 Unix 时间戳（毫秒），消除前后端时区歧义
 * - 前端 dayjs(timestamp) 可无歧义解析并格式化为本地时间
 */
@Configuration
public class JacksonConfig {

    private static final ZoneId ZONE_SHANGHAI = ZoneId.of("Asia/Shanghai");

    /** LocalDateTime → 毫秒时间戳（基于 Asia/Shanghai 时区） */
    public static class LocalDateTimeToTimestampSerializer extends StdSerializer<LocalDateTime> {

        public LocalDateTimeToTimestampSerializer() {
            super(LocalDateTime.class);
        }

        @Override
        public void serialize(LocalDateTime value, JsonGenerator gen, SerializerProvider provider) throws IOException {
            long epochMilli = value.atZone(ZONE_SHANGHAI).toInstant().toEpochMilli();
            gen.writeNumber(epochMilli);
        }
    }

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer jacksonCustomizer() {
        return builder -> builder.serializers(new LocalDateTimeToTimestampSerializer());
    }
}
