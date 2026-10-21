package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 助手长期记忆（按用户隔离）。
 *
 * <p>只存用户显式确认的偏好/事实，不做自动抽取；内容不得含手机、邮箱、
 * 证件、银行卡、密码等敏感信息（服务端写入前过滤）。
 */
@Data
@TableName("ai_user_memory")
public class AiUserMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** preference / fact / instruction */
    private String memoryType;

    private String content;

    /** SHA-256(content)，同用户去重 */
    private String contentHash;

    /** explicit / auto */
    private String source;

    /** active / disabled */
    private String status;

    private LocalDateTime expiresAt;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
