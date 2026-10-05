package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 产出积分规则实体（版本化）。
 * <p>改口径即升版本：历史流水记录当时的 rule_version，绝不因规则变更重算历史分数，
 * 否则被考核人上个月看到的分会凭空变化，绩效申诉无法复算。
 */
@Data
@TableName("rdm_score_rule")
public class RdmScoreRule {

    @TableId
    private Long id;

    /** 规则编码，如 BASE */
    private String ruleCode;

    /** 适用需求类型，NULL=全部 */
    private String reqType;

    /** 适用角色，NULL=全部计分角色 */
    private String roleCode;

    /** 复杂度权重覆盖，NULL=按代码默认表 */
    private BigDecimal complexityWeight;

    /** 类型系数覆盖 */
    private BigDecimal typeFactor;

    /** 优先级加分（系数增量） */
    private BigDecimal priorityBonus;

    /** 按时交付加分 */
    private BigDecimal onTimeBonus;

    /** 逾期扣分上限 */
    private BigDecimal latePenalty;

    /** 验收一次通过加分 */
    private BigDecimal firstPassBonus;

    /** 每次验收返工扣分 */
    private BigDecimal reworkPenalty;

    /** 每次驳回重开扣分 */
    private BigDecimal reopenPenalty;

    /** 满意度系数（偏离 3 分部分） */
    private BigDecimal acceptanceFactor;

    /** 质量因子下限 */
    private BigDecimal qualityFloor;

    /** 角色系数覆盖 */
    private BigDecimal roleFactor;

    /** 单位分 */
    private BigDecimal unitScore;

    /** 分配模式: each/split */
    private String allocMode;

    /** 单条需求计分角色上限（超出需 PMO 确认，防挂名膨胀） */
    private Integer maxScorableRoles;

    /** 规则版本，同码唯一 */
    private Integer version;

    /** 生效日期 */
    private LocalDate effectiveFrom;

    /** 是否当前生效 */
    private Integer enabled;

    /** 说明 */
    private String remark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
