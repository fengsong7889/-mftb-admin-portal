package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 组织编制-岗位实例（表 org_position）。
 * <p>
 * 岗位 = 组织里的一个"坑位"：挂在哪级组织（unit_id）、要求什么职位职级（job_grade_id）、
 * 核定几个编制（headcount）。编制不是人数——同一岗位可能有在职、空缺、冻结三种状态。
 * <p>
 * 本期只落"编制预算"（headcount）。"编制占用"必须由任职（Assignment）反算，
 * 而 Assignment 属 C2 的人员主数据；在 C2 落地前不造一张手工维护的占用数，
 * 否则界面上的"超编"只是人填的数字，不是事实（方案禁止用占位冒充闭环）。
 */
@Data
@TableName("org_position")
public class OrgPosition {

    @TableId
    private Long id;

    /** 岗位编码（稳定业务键，全库唯一） */
    private String code;

    /** 岗位名称 */
    private String name;

    /** 英文名称 */
    private String nameEn;

    /** 所属组织（org_unit.id） */
    private Long unitId;

    /** 职位职级（org_job_grade.id） */
    private Long jobGradeId;

    /** 核定编制数；0 表示尚未核定 */
    private Integer headcount;

    /** 状态：1=启用 0=停用 */
    private Integer status;

    /** 排序（升序） */
    private Integer sortOrder;

    /** 备注 */
    private String remark;

    /** 最后更新人（服务层按登录账号覆盖） */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
