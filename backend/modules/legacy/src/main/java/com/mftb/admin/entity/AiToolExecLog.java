package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 工具执行审计日志（V0 治理底座）。
 * <p>
 * {@code McpExecService} 每次判定（允许/拒绝/待审批）都会写入本表；
 * 参数摘要仅落 SHA-256 前 16 位，敏感原文不入库，防止审计成为泄露面。
 */
@Data
@TableName("ai_tool_exec_log")
public class AiToolExecLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String toolKey;
    private String caller;
    private String conversationId;
    private String argsDigest;
    /** allow/reject/approval_required */
    private String decision;
    private String rejectReason;
    private Long elapsedMs;
    /** 1=成功 0=失败（仅 decision=allow 时有值） */
    private Integer success;
    private LocalDateTime createdAt;
}
