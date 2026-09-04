package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * AI 用量日志实体
 */
@Data
@TableName("ai_usage_log")
public class AiUsageLog {

    @TableId
    private Long id;

    /** 目标类型：employee/department */
    private String targetType;

    /** 目标 ID（员工 ID 或部门 ID） */
    private Long targetId;

    /** 模型 ID */
    private Long modelId;

    /** 操作员工 ID */
    private Long userId;

    /** 请求 tokens 数 */
    private Integer requestTokens;

    /** 响应 tokens 数 */
    private Integer responseTokens;

    /** 总 tokens 数 */
    private Integer totalTokens;

    /** 消耗金额 */
    private BigDecimal costAmount;

    /** 提示词摘要（前 500 字符） */
    private String promptText;

    /** 错误信息 */
    private String errorMessage;

    /** 耗时（毫秒） */
    private Integer durationMs;

    /** 请求时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime requestTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
