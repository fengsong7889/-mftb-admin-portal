package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 通知推送开关（场景 × 渠道）。
 *
 * <p>与 {@code sys_notification_scenario.enabled} 的分工：
 * 那边回答"这个场景有没有绑定可用的企业应用"，这里回答"现在这一刻要不要发"。
 * 临时静音不该去动绑定关系——静音结束后重新打开即可，不必重新校验凭据。
 *
 * <p>被静音时投递器仍要写一行 skipped + 原因（与未绑定钉钉同口径）：
 * "没发"必须能在发送历史里看见，而不是静默消失。
 */
@Data
@TableName("sys_notification_switch")
public class SysNotificationSwitch {

    public static final String CHANNEL_WORK = "DINGTALK_WORK";
    public static final String CHANNEL_GROUP = "DINGTALK_GROUP";

    @TableId(type = IdType.AUTO)
    private Long id;

    private String sceneKey;

    /** DINGTALK_WORK=工作通知 DINGTALK_GROUP=群机器人 */
    private String channel;

    private Integer enabled;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
