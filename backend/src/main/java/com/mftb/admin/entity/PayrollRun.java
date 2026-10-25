package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 核算批次（表 payroll_run）：某城市某工资月的一次算薪。
 * <p>
 * 批次是"可重算"的容器：试算可以反复做（先清后写），一旦锁定就不可再算——
 * 已发工资不能因为有人改了薪酬标准就悄悄变数。
 */
@Data
@TableName("payroll_run")
public class PayrollRun {

    @TableId
    private Long id;

    /** 工资月 YYYY-MM */
    private String period;

    /** 统筹区/城市代码 */
    private String cityCode;

    /** 使用规则集（快照：锁定后即使规则被改也能追溯当时口径） */
    private Long ruleSetId;

    /** 币种 */
    private String currency;

    /** 状态：DRAFT / CALCULATED / LOCKED */
    private String status;

    /** 试算完成时间 */
    private LocalDateTime calculatedAt;

    /** 锁定时间 */
    private LocalDateTime lockedAt;

    /** 备注 */
    private String remark;

    /** 试算提示（缺参保等，不阻断但有风险的事项） */
    private String warnings;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
