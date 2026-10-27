package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 助手待确认动作（当前用于“推送项目进度”）。
 *
 * <p>为什么落库而不是放内存：确认卡可能跨请求、跨实例；表里的
 * {@code status} 原子流转（pending → processing → sent/failed）是防重复推送的唯一防线。
 */
@Data
@TableName("ai_action_request")
public class AiActionRequest {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** rdm_progress_group / rdm_progress_person / user_memory_save（二期） */
    private String actionType;

    /** 关联会话主键（可空） */
    private Long conversationPk;

    /** 发起人账号（工号） */
    private String operator;

    /** 冻结的发送参数 JSON（projectId/targetType/recipientUserId/title/content） */
    private String payloadJson;

    /** 确认卡预览文本 */
    private String previewText;

    /** pending / processing / sent / failed / cancelled / expired */
    private String status;

    private LocalDateTime expiresAt;

    private LocalDateTime executedAt;

    private String resultMessage;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
