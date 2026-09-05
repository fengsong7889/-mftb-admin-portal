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
 * 员工模型权控-职位授权策略
 * 按「职级序列 + 职级」范围匹配员工，批量授予模型访问权（能力粒度存在 modelConfigs JSON 中）
 */
@Data
@TableName("ai_emp_pos_auth_strategy")
public class AiEmpPosAuthStrategy {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 配置ID（按编号生成规则 ai_emp_pos_model_auth 生成，如 ZWMX20260906000） */
    private String configCode;

    /** 策略名称 */
    private String strategyName;

    /** 职级序列 JSON 数组 */
    private String sequences;

    /** 职级 JSON 数组 */
    private String jobLevels;

    /** 授权模型能力配置 JSON 数组（modelId + 5 个能力开关） */
    private String modelConfigs;

    /** 数据不出域：1=启用 0=未启用 */
    private Integer dataResidency;

    /** 策略描述 */
    private String description;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 创建人 */
    private String createdBy;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
