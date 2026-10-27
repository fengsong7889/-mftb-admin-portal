package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * AI 预算流水（V0 网关侧预占/结算/释放）。
 * <p>
 * 一次 chat 请求生成一条 RESERVED；服务端取得实际 usage 后 SETTLED；
 * 客户端异常/超时且服务端无法核实实际 tokens 时保持 RESERVED，
 * verification_status=UNKNOWN，用量展示为「未知」而非 0。
 */
@Data
@TableName("ai_budget_ledger")
public class AiBudgetLedger {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String username;
    private String modelKey;
    /** 幂等键：一次请求唯一 ID（客户端可传入，缺省时服务端生成） */
    private String requestId;

    private Integer reservationTokens;
    private BigDecimal reservedCost;
    private Integer actualTokens;
    private BigDecimal actualCost;
    private String currency;
    /** RESERVED / SETTLED / RELEASED */
    private String status;
    /** VERIFIED / ESTIMATED / UNKNOWN */
    private String verificationStatus;
    private String errorMessage;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
