package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 考勤组成员（带生效区间）。
 * <p>
 * 为什么必须有 validFrom/validTo：判定"某人当天属于哪个考勤组"必须按当时的归属，
 * 用今天的归属去重算历史月份是考勤最常见的错账（3 月调过组的人，2 月不该按新组班次算）。
 */
@Data
@TableName("att_group_member")
public class AttGroupMember {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long groupId;

    /** 成员 sys_user.id（跨模块引用，无 FK） */
    private Long userId;

    private String empNo;

    private String empName;

    private Long deptId;

    /** 部门名称快照：改名不改历史 */
    private String deptName;

    /** 生效起（含） */
    private LocalDate validFrom;

    /** 生效止（含）；null 表示当前仍生效 */
    private LocalDate validTo;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
