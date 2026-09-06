package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 助手会话实体
 * 存储用户的多轮对话历史，消息以 JSON 格式持久化
 */
@Data
@TableName("ai_conversation")
public class AiConversation {

    @TableId
    private Long id;

    /** 对话编号（DH + YYYYMMDD + 7位自增序号） */
    private String conversationId;

    /** 用户账号 */
    private String username;

    /** 会话标题 */
    private String title;

    /** 消息列表 JSON */
    private String messages;

    /** 本次会话使用的模型标识（AUTO 时记录实际路由模型） */
    private String modelKey;

    /** 本次会话累计消耗 tokens（输入+输出） */
    private Integer totalTokens;

    /** 本次会话累计请求次数 */
    private Integer requestCount;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    /** 删除时间戳（回收站支持） */
    private LocalDateTime deletedAt;

    @TableLogic
    private Integer deleted;
}
