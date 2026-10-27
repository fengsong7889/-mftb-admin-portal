package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 资产盘点操作日志实体
 */
@Data
@TableName("biz_eam_inventory_event")
public class EamInventoryEvent {

    @TableId
    private Long id;

    /** 盘点任务 ID */
    private Long taskId;

    /** 盘点明细 ID（任务级动作为空） */
    private Long itemId;

    /** 动作 create/check/batch/reset/complete/partial/cancel */
    private String action;

    /** 幂等键 */
    private String requestKey;

    /** 请求摘要 */
    private String requestHash;

    /** 变更前值 JSON */
    private String beforeJson;

    /** 变更后值 JSON */
    private String afterJson;

    /** 原因/说明 */
    private String reason;

    /** 登录操作人 ID */
    private Long operatorId;

    /** 操作人姓名 */
    private String operatorName;

    /** 操作人工号 */
    private String operatorEmpNo;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
