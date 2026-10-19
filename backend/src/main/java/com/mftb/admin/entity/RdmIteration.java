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

    /**
     * 所属项目ID（rdm_project.id）。
     * <p>归属体系改造（v3.15）：sprint / version 必须挂项目，hotfix（紧急修复）允许为空
     * ——跨项目线上事故的「平台级热修」迭代没有单一项目归属。存量迭代不回填，
     * 由管理员在迭代排期列表逐个补挂（未挂行前端显示「未掛項目」警示）。
     */
    private Long projectId;

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
