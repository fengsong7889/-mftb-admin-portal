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
 * RDM 贡献分预算实体（阶段 6）。
 * <p>预算只做超限预警，不自动折算个人分数：折算会让一个人的分数取决于同部门
 * 其他人产出了多少，那已经不是他的贡献。
 */
@Data
@TableName("rdm_score_budget")
public class RdmScoreBudget {

    /** 全员预算的部门占位（MySQL 唯一索引不约束 NULL，用 0 表示全局） */
    public static final long COMPANY_DIM = 0L;

    @TableId
    private Long id;

    /** 绩效周期编码 */
    private String periodCode;

    /** 部门ID，0=全员预算 */
    private Long deptId;

    /** 部门名称快照 */
    private String deptName;

    /** 本周期可分配的贡献分预算上限 */
    private BigDecimal scoreBudget;

    /** 预警阈值（占用达到该百分比时提示 PMO） */
    private BigDecimal warningRatio;

    /** 预算依据（人力/迭代容量/历史均值等） */
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
