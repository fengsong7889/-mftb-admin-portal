package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 敏感字段明文查看留痕（表 hcm_pii_access_log）。
 * <p>
 * 为什么单独一张表而不复用人事审计：人事审计按 sys_user 维度记业务动作，
 * 本表按 person 维度记「谁在什么时候看了哪些字段」，用于事后追责与合规应答。
 * 不记录字段值本身——日志里出现明文等于把泄露面扩大一次。
 */
@Data
@TableName("hcm_pii_access_log")
public class HcmPiiAccessLog {

    @TableId
    private Long id;

    /** 查看人账号（工号口径） */
    private String actor;

    /** 被查看的人员 ID */
    private Long personId;

    /** 查看的字段组，逗号分隔：mobile,email,birthDate */
    private String fields;

    /** 场景：detail / list / export */
    private String scene;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
