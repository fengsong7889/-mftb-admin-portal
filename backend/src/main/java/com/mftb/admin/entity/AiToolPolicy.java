package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * AI 工具执行授权策略（V0 治理底座）。
 * <p>
 * 与 {@code mcp_tool} 一一对应，广场管「安装」，本表管「放行」：
 * enabled=0 或 require_approval=1 但缺少凭证时，{@code McpExecService} 一律拒绝执行。
 * 默认拒绝：新工具未登记即视为未授权，避免"安装 = 有权限"的漏洞。
 */
@Data
@TableName("ai_tool_policy")
public class AiToolPolicy {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 工具标识（对应 mcp_tool.tool_key） */
    private String toolKey;

    /** 1=允许执行 0=禁止执行 */
    private Integer enabled;

    /** 风险等级 low/medium/high */
    private String riskLevel;

    /** 1=调用需服务端审批凭证 0=仅需工具级授权 */
    private Integer requireApproval;

    /** 数据范围白名单 JSON（groupCodes / brand / fields） */
    private String dataScopeJson;

    private String remark;
    private String updatedBy;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
