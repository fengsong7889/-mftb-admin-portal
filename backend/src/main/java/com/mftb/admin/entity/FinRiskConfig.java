package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 推广金消费风控配置实体（集团+品牌维度一行）
 * <p>
 * 无记录视为默认已付池限额模式（仅当集团存在未结清欠款时限额生效）
 */
@Data
@TableName("biz_fin_risk_config")
public class FinRiskConfig {

    @TableId
    private Long id;

    /** 集团ID（关联 biz_merchant_group.group_code） */
    private String groupCode;

    /** 集团名称快照 */
    private String groupName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 状态: enabled=启用 disabled=停用（停用后不限制消费） */
    private String status;

    /** 未付部分释放方式: repay=还款释放 monthly=每月比例释放 */
    private String releaseMode;

    /** 每月释放比例（小数，如 0.1000=10%/月，monthly 模式生效） */
    private BigDecimal monthlyReleaseRatio;

    /** 备注（白名单原因等） */
    private String remark;

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
