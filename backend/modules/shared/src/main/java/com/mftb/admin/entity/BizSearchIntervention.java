package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 搜索商家干预规则实体（方案 §9/§11.1「干预规则」）。
 * <p>泛词降权/精确准入/临时扶持/同集团打散。必须带原因与有效期，到期自动失效；
 * 明确找店受保护、店内搜索不受跨店治理影响；禁止以「未购买广告」作为自动降权条件。
 */
@Data
@TableName("biz_search_intervention")
public class BizSearchIntervention {

    @TableId
    private Long id;

    private String ruleNo;

    /** 干预规则名称（人类可读标识，方案 §11.1 定版的权威业务字段）：与 {@code targetName}（被干预对象名）语义不同 */
    private String ruleName;

    /** 1=集团 2=门店 */
    private Integer targetType;

    private String targetId;

    private String targetName;

    /** 1=泛词降权 2=精确准入 3=临时扶持 4=同集团打散 */
    private Integer actionType;

    private String scopeTerms;

    /** 精确准入白名单词 */
    private String exactTerms;

    /** 干预乘数 B（DECIMAL，禁 float） */
    private BigDecimal multiplier;

    private String regionCode;

    private Integer surface;

    private Integer bizChannel;

    /** 干预原因（必填） */
    private String reason;

    private LocalDate startDate;

    private LocalDate endDate;

    /** 1=未审批 2=已审批 3=驳回 */
    private Integer approvalStatus;

    private String approver;

    /** 1=启用 2=停用 */
    private Integer status;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
