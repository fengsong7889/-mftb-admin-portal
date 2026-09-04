package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * AI 助手用量明细行（附带员工姓名/工号，供前端展示「姓名（工号）」）
 */
@Data
public class LlmUsageRecordVO {

    private Long id;

    /** 使用账号（登录用户名） */
    private String username;

    /** 员工姓名（来自 sys_user，账号不存在时为空） */
    private String name;

    /** 工号 */
    private String empId;

    /** 引擎模式: auto/primary/off-peak */
    private String mode;

    /** 路由通道: primary / off-peak */
    private String channel;

    /** 实际调用的模型 */
    private String model;

    private Integer promptTokens;

    private Integer completionTokens;

    private Integer cachedTokens;

    private BigDecimal cost;

    private String currency;

    private LocalDateTime createdAt;
}
