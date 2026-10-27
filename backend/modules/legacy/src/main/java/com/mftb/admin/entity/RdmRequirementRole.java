package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 需求参与角色实体（同一需求多人多角色）
 */
@Data
@TableName("rdm_requirement_role")
public class RdmRequirementRole {

    @TableId
    private Long id;

    /** 需求ID */
    private Long reqId;

    /** 成员 sys_user.id */
    private Long userId;

    /** 工号快照 */
    private String empNo;

    /** 姓名快照 */
    private String empName;

    /** 角色编码（见 RdmConstants.ROLE_*） */
    private String roleCode;

    /** 是否有效参与人 */
    private Integer isActive;

    /** 加入时间 */
    private LocalDateTime joinTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
