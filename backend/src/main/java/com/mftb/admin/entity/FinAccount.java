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
 * 推广金账户实体（集团维度一行）
 */
@Data
@TableName("biz_fin_account")
public class FinAccount {

    @TableId
    private Long id;

    /** 集团ID（关联 biz_merchant_group.group_code） */
    private String groupCode;

    /** 集团名称快照 */
    private String groupName;

    /** 所属品牌: flashBee / mFood */
    private String brand;

    /** 虚拟账户余额 */
    private BigDecimal virtualBalance;

    /** 实收账户余额 */
    private BigDecimal actualBalance;

    /** 账户状态: normal=正常 frozen=已冻结 mergeFrozen=合并冻结 cancelled=已注销 */
    private String status;

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
