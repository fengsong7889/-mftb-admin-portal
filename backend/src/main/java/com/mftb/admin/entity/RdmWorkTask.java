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
 * RDM 执行任务与工时实体（L3：UI设计/前端/后端/测试/数据）。
 * <p>{@code planHours}/{@code actualHours} 是产出量化与绩效对接的原始数据，
 * 不得用更新时间倒推。
 */
@Data
@TableName("rdm_work_task")
public class RdmWorkTask {

    @TableId
    private Long id;

    /** 任务编号 RT+YYYYMMDD+4位 */
    private String taskNo;

    /** 业务需求ID */
    private Long reqId;

    /** 所属 PRD */
    private Long prdId;

    /** 任务类型: design/frontend/backend/qa/data */
    private String taskType;

    /** 任务标题 */
    private String title;

    /** 任务说明 */
    private String content;

    /** 负责人ID */
    private Long ownerUserId;

    /** 负责人工号快照 */
    private String ownerEmpNo;

    /** 负责人姓名 */
    private String ownerName;

    /** 负责人角色（DESIGNER/DEV/QA…） */
    private String roleCode;

    /** 状态: todo/doing/done/blocked/cancelled */
    private String status;

    /** 进度百分比 */
    private Integer progress;

    /** 计划工时 */
    private BigDecimal planHours;

    /** 实际工时 */
    private BigDecimal actualHours;

    /** 计划开始 */
    private LocalDate planStartDate;

    /** 计划完成 */
    private LocalDate planFinishDate;

    /** 实际开始 */
    private LocalDateTime actualStartTime;

    /** 实际完成 */
    private LocalDateTime actualFinishTime;

    /** 阻塞原因 */
    private String blockedReason;

    /** 所属迭代编码 */
    private String iterationCode;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
