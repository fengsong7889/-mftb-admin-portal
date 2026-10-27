package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 系统配置实体（通用 key-value 存储）
 * 规则配置页面保存时通过 API 同步写入，后端服务从 DB 动态读取
 */
@Data
@TableName("sys_config")
public class SysConfig {

    @TableId
    private Long id;

    /** 配置项唯一标识（如 session_idle_timeout_ms） */
    private String configKey;

    /** 配置值 */
    private String configValue;

    /** 配置说明 */
    private String description;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
