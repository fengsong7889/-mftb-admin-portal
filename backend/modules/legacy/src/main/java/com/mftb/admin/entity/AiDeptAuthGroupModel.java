package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 策略-模型授权与能力配置表
 */
@Data
@TableName("ai_dept_auth_group_model")
public class AiDeptAuthGroupModel {

    @TableId
    private Long id;

    /** 策略组 ID */
    private Long groupId;

    /** 模型 ID */
    private Long modelId;

    /** 视觉理解：1=开放 0=关闭 */
    private Integer visionSupport;

    /** 工具调用：1=开放 0=关闭 */
    private Integer functionCalling;

    /** JSON 模式：1=开放 0=关闭 */
    private Integer jsonMode;

    /** 流式响应：1=开放 0=关闭 */
    private Integer streaming;

    /** 思考模式：1=开放 0=关闭 */
    private Integer thinkingMode;

    /** 优先级（数字越大越优先） */
    private Integer priority;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
