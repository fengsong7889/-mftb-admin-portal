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
 * RDM 效能量日快照实体（趋势页与报表的唯一数据源）。
 * <p>按天冻结而非实时计算：实时算会让"上周看过的按时率这周变了"，
 * 绩效一旦引用就无法解释；数据量大时每次全表扫描也会把看板拖慢。
 */
@Data
@TableName("rdm_metric_snapshot")
public class RdmMetricSnapshot {

    @TableId
    private Long id;

    /** 快照日期 */
    private LocalDate statDate;

    /** 维度: COMPANY/DEPT/PERSON/PM */
    private String dimType;

    /** 维度对象ID，COMPANY 为 NULL */
    private Long dimId;

    /** 维度名称快照 */
    private String dimName;

    /** 截至当日存量需求数 */
    private Integer reqTotal;

    /** 当日新提交 */
    private Integer submitted;

    /** 当日受理 */
    private Integer accepted;

    /** 当日上线 */
    private Integer released;

    /** 当日逾期存量 */
    private Integer overdue;

    /** 平均响应时长（小时） */
    private BigDecimal avgResponseHours;

    /** 平均交付周期（天） */
    private BigDecimal avgDeliveryDays;

    /** 按时上线率 */
    private BigDecimal onTimeRate;

    /** 驳回率 */
    private BigDecimal rejectRate;

    /** 验收一次通过率 */
    private BigDecimal firstPassRate;

    /** 当日返工次数 */
    private Integer reworkCount;

    /** 当日变更次数 */
    private Integer changeCount;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
