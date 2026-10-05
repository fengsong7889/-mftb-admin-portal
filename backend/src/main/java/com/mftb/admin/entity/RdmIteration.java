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
 * RDM 迭代/版本排期实体。
 */
@Data
@TableName("rdm_iteration")
public class RdmIteration {

    @TableId
    private Long id;

    /** 迭代编码，如 SP2026-10A */
    private String code;

    /** 迭代名称 */
    private String name;

    /** 类型: sprint/version/hotfix */
    private String iterationType;

    /** 开始日期 */
    private LocalDate startDate;

    /** 结束日期 */
    private LocalDate endDate;

    /** 产能（工时） */
    private Integer capacityHours;

    /** 迭代负责人ID */
    private Long ownerUserId;

    /** 迭代负责人姓名 */
    private String ownerName;

    /** 状态: planning/active/closed */
    private String status;

    /** 说明 */
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
