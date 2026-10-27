package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 秒杀期数实体
 */
@Data
@TableName("biz_flash_sale_period")
public class BizFlashSalePeriod {

    @TableId
    private Long id;

    /** 期数（如 85） */
    private Integer periodNo;

    /** 开始日期 */
    private LocalDate startDate;

    /** 结束日期 */
    private LocalDate endDate;

    /** 状态: 1=进行中, 2=已结束 */
    private Integer status;

    /** 备注 */
    private String remark;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
