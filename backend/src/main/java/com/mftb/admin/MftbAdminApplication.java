package com.mftb.admin;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

/**
 * MFTB 搜广推系统后端启动类
 */
@SpringBootApplication
@MapperScan("com.mftb.admin.mapper")
@EnableScheduling
public class MftbAdminApplication {

    public static void main(String[] args) {
        // 统一 JVM 时区为北京时间，确保 LocalDateTime.now() 返回北京时间
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        SpringApplication.run(MftbAdminApplication.class, args);
    }

}
