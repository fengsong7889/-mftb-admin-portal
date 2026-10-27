package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 卡片排序配置实体（全局共享，按菜单+Tab维度保存）
 */
@Data
@TableName("sys_card_order")
public class SysCardOrder {

    @TableId
    private Long id;

    /** 菜单标识: algorithm / waterfall / ad-sales */
    private String menuKey;

    /** Tab标识: delivery / groupBuy */
    private String tabKey;

    /** 卡片类型顺序 JSON 数组, 如 [1,3,2,5] */
    private String cardOrder;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
