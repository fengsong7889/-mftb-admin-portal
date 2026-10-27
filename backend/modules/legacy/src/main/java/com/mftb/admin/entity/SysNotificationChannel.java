package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 通知渠道配置实体（支持多场景）
 * 每条记录对应一个通知渠道（如某个钉钉群机器人），可绑定一个或多个业务场景
 */
@Data
@TableName("sys_notification_channel")
public class SysNotificationChannel {

    @TableId
    private Long id;

    /** 渠道名称，如「默认群」「OA审批群」 */
    private String name;

    /** 平台类型：dingtalk / wecom / feishu */
    private String channel;

    /** Webhook 地址 */
    private String webhookUrl;

    /** 加签密钥 */
    private String secret;

    /** 默认@手机号（逗号分隔） */
    private String atMobiles;

    /** 是否启用 0/1 */
    private Integer enabled;

    /** 是否为该平台的默认渠道 */
    private Integer isDefault;

    /** 绑定场景标识（逗号分隔），如 oa_approval,ai_assistant */
    private String scenarios;

    /** 备注 */
    private String remark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
