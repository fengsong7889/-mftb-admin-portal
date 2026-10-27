package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 人事操作审计（方案 §5.5「新增人事操作审计，不能用登录日志或 localStorage 更新时间代替」、§7.4）。
 * <p>
 * 一条审计 = 一次操作的一个字段：改 3 个字段落 3 行，这样「谁把证件号从 A 改成 B」
 * 是能直接查出来的形状，而不是塞进一段 JSON 等人解析。动作级信息（原因、来源单号、生效日）
 * 在每行上重复存，是刻意的：审计行必须能脱离业务单据独立解读。
 * <p>
 * <b>不带 deleted 列</b>：审计是留痕，不是业务数据。给软删标记等于给自己留一条「让某次操作
 * 从报表里消失」的路径，而 §7.4 要求的是相反的方向。
 */
@Data
@TableName("hr_operation_audit")
public class HrOperationAudit {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 被操作的员工（sys_user.id） */
    private Long userId;

    /** 员工工号快照：账号改名/删号后仍能定位当时是谁 */
    private String empNo;

    /** 动作（真值见 {@link com.mftb.admin.constant.HrAuditAction}） */
    private String action;

    /** 字段名（动作级留痕时为 null，例如明文查看、期间登记） */
    private String fieldName;

    /** 变更前值（敏感字段已脱敏） */
    private String beforeValue;

    /** 变更后值（敏感字段已脱敏） */
    private String afterValue;

    /** 动作补充说明（异动动作 code、雇佣段序号、查看的字段清单等） */
    private String detail;

    /** 原因（单据或操作者填写的理由） */
    private String reason;

    /** 来源单号：人事流程单据号，用于把审计与单据对上 */
    private String sourceReqNo;

    /** 业务生效日：与 occurredAt 分开，未来生效的操作两个值不同（§7.2） */
    private LocalDate effectiveDate;

    /**
     * 是否涉及敏感面（动作或字段任一命中即为 1，展示端据此二次收口）。
     * <p>列名用反引号包起来：<b>sensitive 是 MySQL 8 保留字</b>（索引敏感度），
     * 不加引号的 DDL 与 INSERT 都会直接报语法错（开发库首次启动实测踩到）。
     */
    @TableField("`sensitive`")
    private Integer sensitive;

    /** 操作人（账号名/工号快照；定时任务执行时为系统标识） */
    private String operator;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime occurredAt;
}
