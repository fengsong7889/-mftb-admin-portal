package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 考核模板：等级方案 + 权重合计 + 指标清单（可复用）。
 * <p>
 * 参考 SQL: backend/sql/201_hr_performance.sql
 */
@Data
@TableName("hr_perf_template")
public class HrPerfTemplate {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 模板名称 */
    private String name;

    /** 适用周期类型，空表示通用 */
    private String applyCycleType;

    /** 等级方案 JSON：[{code,minScore,ratio}]，code 取字典 PERF_GRADE */
    private String gradeScheme;

    /** 指标权重合计（约定 100） */
    private Integer weightSum;

    /** 状态：1 启用 0 停用 */
    private Integer status;

    /** 备注 */
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
