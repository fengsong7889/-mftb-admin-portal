package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 员工模型权控-自定义角色授权
 * 自定义角色（与权限系统角色无关）绑定员工列表，按绑定关系授予模型访问权
 */
@Data
@TableName("ai_emp_role_auth")
public class AiEmpRoleAuth {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 配置ID（按编号生成规则 ai_emp_role_model_auth 生成，如 JSMX20260906000） */
    private String configCode;

    /** 角色编码（前端展示 ID，唯一） */
    private String roleCode;

    /** 角色名称 */
    private String roleName;

    /** 角色描述 */
    private String description;

    /** 绑定员工 ID JSON 数组 */
    private String userIds;

    /** 授权模型能力配置 JSON 数组（modelId + 5 个能力开关） */
    private String modelConfigs;

    /** 数据不出域：1=启用 0=未启用 */
    private Integer dataResidency;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 创建人 */
    private String createdBy;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
