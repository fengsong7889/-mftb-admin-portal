package com.mftb.admin;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * MFTB 通用管理平台后端启动类
 */
@SpringBootApplication
@MapperScan("com.mftb.admin.mapper")
public class MftbAdminApplication {

    public static void main(String[] args) {
        SpringApplication.run(MftbAdminApplication.class, args);
    }

}
