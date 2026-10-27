package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 配置变更审计。 */
@Data
@TableName("ai_config_change_log")
public class AiConfigChangeLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String configType;
    private String configKey;
    private String action;
    private String beforeJson;
    private String afterJson;
    private String operator;
    private LocalDateTime createdAt;
}
