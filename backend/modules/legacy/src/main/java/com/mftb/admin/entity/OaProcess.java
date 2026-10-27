package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * OA流程定义实体（流程中心展示的流程类型）
 */
@Data
@TableName("biz_oa_process")
public class OaProcess {

    @TableId
    private Long id;

    /** 流程编码(如 oa_leave) */
    private String processCode;

    /** 流程名称 */
    private String processName;

    /** 分类: office/finance/hr/general */
    private String category;

    /** 图标标识 */
    private String icon;

    /** 流程说明 */
    private String description;

    /** 关联 biz_workflow_config.flow_type */
    private String workflowType;

    /** 表单字段定义JSON */
    private String formSchema;

    /** 排序 */
    private Integer sortOrder;

    /** 1=启用 0=停用 */
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
