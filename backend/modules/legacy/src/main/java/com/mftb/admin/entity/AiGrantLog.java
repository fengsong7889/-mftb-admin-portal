package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 使用申请审批发放幂等日志（flow_no 唯一，避免重放导致重复授权）。 */
@Data
@TableName("ai_grant_log")
public class AiGrantLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String flowNo;
    private Long requestId;
    private Long userId;
    private String username;
    /** model_auth / quota */
    private String grantType;
    private String payloadJson;
    /** GRANTED / FAILED / REVOKED */
    private String status;
    private String errorMessage;
    private String operator;
    private LocalDateTime createdAt;
}
