package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * OA流程实例实体
 */
@Data
@TableName("biz_oa_request")
public class OaRequest {

    @TableId
    private Long id;

    /** 流程编号 */
    private String flowNo;

    /** 关联流程定义编码 */
    private String processCode;

    /** 流程标题 */
    private String title;

    /** 表单数据JSON */
    private String formData;

    /** 申请人 */
    private String applicant;

    /** 流程状态: pending/approved/rejected/cancelled */
    private String flowStatus;

    /** 当前待审节点名称 */
    private String currentNodeName;

    /** 驳回理由 */
    private String rejectReason;

    /** 申请时间 */
    private LocalDateTime applyTime;

    /** 完成时间 */
    private LocalDateTime completeTime;

    /** 撤销时间 */
    private LocalDateTime cancelTime;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
