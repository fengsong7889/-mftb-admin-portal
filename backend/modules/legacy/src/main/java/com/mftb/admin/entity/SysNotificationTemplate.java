package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 通知模板（按场景一行，钉钉 markdown）。
 *
 * <p>模板只负责"怎么写"，不负责"发不发"——后者在 {@link SysNotificationSwitch}。
 * 两者分开的理由：改文案的人与决定静音的人常常不是同一个人，合成一行会互相覆盖。
 *
 * <p>{@code enabled=0} 时回落内置默认文案（{@code MeetingMinutesRenderer} 的硬编码版本），
 * 保证模板写坏或停用时通知仍然发得出去、且内容可读。
 */
@Data
@TableName("sys_notification_template")
public class SysNotificationTemplate {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String sceneKey;

    private String sceneName;

    private String titleTpl;

    private String bodyTpl;

    /** 可用变量说明（仅给编辑页提示，不参与渲染） */
    private String variables;

    private Integer enabled;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
