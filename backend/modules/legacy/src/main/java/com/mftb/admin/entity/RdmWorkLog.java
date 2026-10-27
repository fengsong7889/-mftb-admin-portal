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
 * RDM 工时明细实体（阶段 3：实际工时的事实来源）。
 * <p>任务表上的 {@code actual_hours} 改为本表明细的汇总：只有按人按工作日记录，
 * 才能区分「谁投入了多少」并同时支撑负载核算与估时偏差；由他人代填会让这两类指标一起做假。
 */
@Data
@TableName("rdm_work_log")
public class RdmWorkLog {

    @TableId
    private Long id;

    /** 任务ID */
    private Long taskId;

    /** 需求ID（冗余，便于按需求/人员汇总） */
    private Long reqId;

    /** 填报人 */
    private Long userId;

    /** 填报人姓名快照 */
    private String userName;

    /** 工作日期（同人同任务同日唯一，重复提交视为修订） */
    private LocalDate workDate;

    /** 当日投入工时（人时） */
    private BigDecimal hours;

    /** 说明 */
    private String remark;

    private String createdBy;

    /** 最后更新人：修订留痕（完整历史版本留到后续阶段） */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
