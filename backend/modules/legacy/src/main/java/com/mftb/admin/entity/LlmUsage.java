package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * AI 助手使用统计明细（请求级）
 * 由开发环境 LLM 代理在转发成功后回传落库；费用按请求时刻单价快照计算
 */
@Data
@TableName("biz_llm_usage")
public class LlmUsage {

    @TableId
    private Long id;

    /** 使用账号（取自 JWT，不接受客户端传入） */
    private String username;

    /** 引擎模式: auto/primary/off-peak */
    private String mode;

    /** 路由通道: primary=百炼QW / off-peak=DeepSeek */
    private String channel;

    /** 实际调用的模型（响应回传，回落时为真实接管模型） */
    private String model;

    /** 输入 tokens */
    private Integer promptTokens;

    /** 输出 tokens */
    private Integer completionTokens;

    /** 命中缓存的输入 tokens（按缓存单价计费） */
    private Integer cachedTokens;

    /** 本次费用（请求时刻单价快照计算） */
    private BigDecimal cost;

    /** 币种: CNY/USD；无单价配置时为空 */
    private String currency;

    /**
     * V0 计量可信等级（§B.5）：
     * <ul>
     *   <li>VERIFIED：网关侧实际取到 usage 且命中单价</li>
     *   <li>ESTIMATED：网关侧取到 usage 但无单价，费用记 0（展示为“估算”）</li>
     *   <li>UNKNOWN：历史客户端自报或无 usage，展示为“未知”</li>
     * </ul>
     */
    private String verificationStatus;

    /** 关联 {@code ai_budget_ledger.request_id}，服务端计量口径下不为空 */
    private String requestId;

    private LocalDateTime createdAt;
}
