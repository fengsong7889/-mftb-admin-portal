package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 运行参数：键值配置（记忆上限/保留期/注入条数等），避免为每个参数加列。 */
@Data
@TableName("ai_runtime_setting")
public class AiRuntimeSetting {

    @TableId(type = IdType.INPUT)
    private String settingKey;

    private String settingValue;

    /** int / bool / string */
    private String valueType;

    private String remark;

    private String updatedBy;

    private LocalDateTime updatedAt;
}
