package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 项目主表实体
 */
@Data
@TableName("rdm_project")
public class RdmProject {

    @TableId
    private Long id;

    /** 项目编号 */
    private String projectNo;

    /** 项目名称 */
    private String name;

    /** 项目目标 */
    private String objective;

    /** 项目经理用户ID */
    private Long pmUserId;

    /** 项目经理姓名 */
    private String pmUserName;

    /** 产品负责人用户ID */
    private Long productOwnerUserId;

    /** 产品负责人姓名 */
    private String productOwnerUserName;

    /** 计划开始日期 */
    private LocalDate planStartDate;

    /** 计划结束日期 */
    private LocalDate planEndDate;

    /** 默认验收路径(A=先验收后上线,B=先上线后验收) */
    private String defaultAcceptancePath;

    /** 状态:preparing/in_progress/partial_delivered/all_delivered/closed */
    private String status;

    /** 暂停标记 */
    private Integer pausedFlag;

    /** 风险标记 */
    private Integer riskFlag;

    /** 逾期标记 */
    private Integer overdueFlag;

    /** 范围摘要JSON */
    private String scopeSummaryJson;

    /** 乐观锁版本 */
    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
