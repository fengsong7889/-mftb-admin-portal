package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 回答反馈：一个用户对一条助手消息只保留一条记录（赞/踩可改）。 */
@Data
@TableName("ai_feedback")
public class AiFeedback {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long conversationPk;

    private String messageId;

    private Long userId;

    /** 1=赞 -1=踩 */
    private Integer rating;

    private String reason;

    private String answerPreview;

    private String toolKeys;

    private LocalDateTime createdAt;
}
