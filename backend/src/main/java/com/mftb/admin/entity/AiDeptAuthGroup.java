package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 部门模型授权策略主表
 */
@Data
@TableName("ai_dept_auth_group")
public class AiDeptAuthGroup {

    @TableId
    private Long id;

    /** 配置ID（按编号生成规则 ai_dept_model_auth 生成，如 BMMX20260906000） */
    private String configCode;

    /** 策略名称 */
    private String name;

    /** 策略描述 */
    private String description;

    /** 数据不出域：1=启用 0=未启用 */
    private Integer dataResidency;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 关联部门总人数（冗余缓存） */
    private Integer totalEmployeeCount;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除：0=未删除 1=已删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
