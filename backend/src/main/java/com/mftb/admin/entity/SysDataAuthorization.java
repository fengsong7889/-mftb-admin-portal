package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 数据授权实体: 角色/部门 → 可见商家范围
 */
@Data
@TableName("sys_data_authorization")
public class SysDataAuthorization {

    @TableId
    private Long id;

    /** 授权对象类型: role / department */
    private String targetType;

    /** 角色ID 或 部门ID */
    private Long targetId;

    /** 授权商家集团编码 (biz_merchant_group.group_code) */
    private String groupCode;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

    /** 创建人 */
    private String createdBy;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private java.time.LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private java.time.LocalDateTime updatedAt;
}
