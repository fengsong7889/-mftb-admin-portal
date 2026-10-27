package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 通知外部投递日志（V0 §八 V0-6）。
 * <p>与 {@code ai_tool_exec_log} 区分：exec_log 关注「工具是否被允许执行」，
 * 本表关注「渠道是否已受理该次投递」。渠道不保证送达/已读，SENT 仅代表钉钉/SMTP 侧接收。
 */
@Data
@TableName("ai_delivery_log")
public class AiDeliveryLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String toolKey;
    /** dingtalk / email / wecom / ... */
    private String channel;
    private String caller;
    private Long conversationPk;
    private String conversationId;
    /** 收件目标脱敏摘要（如 a***@example.com，或钉钉群名） */
    private String recipientSummary;
    /** 标题或内容前 100 字预览 */
    private String subjectPreview;
    /** SENT / FAILED / UNKNOWN */
    private String status;
    /** 渠道返回码：钉钉 errcode 转字符串；SMTP 响应码等 */
    private String externalErrcode;
    private String errorMessage;
    private Integer attempts;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
