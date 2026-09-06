package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * MCP 工具注册表
 * AI 助手工具广场：广场管「接入」（安装/卸载），AI 操作授權管「放行」（L0-L4 治理）
 */
@Data
@TableName("mcp_tool")
public class McpTool {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 工具唯一标识（MCP tool name，下发模型的 function name） */
    private String toolKey;
    private String name;
    /** 分类: finance/promotion/merchant/ai/notify */
    private String category;
    /** 工具来源: builtin=内置工具（前端执行器直调后端 API） external=外部服务（MCP Server，执行链路规划中） */
    private String source;
    /** 外部服务接入方式: remote-http / remote-sse / local-stdio（builtin 为 null） */
    private String transport;
    /** 能力描述（作为 tool description 下发给模型） */
    private String description;
    /** 图标名称（MenuIcon 注册表） */
    private String icon;
    private String version;
    /** 风险等级 L0~L4（与 AI 操作授权分级一致） */
    private String riskLevel;
    /** 参数 JSON Schema（作为 parameters 下发给模型） */
    private String paramsJson;
    /** 是否启用: 1=启用 0=停用 */
    private Integer enabled;
    /** 是否已安装: 1=已安装（AI 助手即刻具备该能力） */
    private Integer installed;
    private String installedBy;
    private LocalDateTime installedAt;
    private Integer sort;

    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
