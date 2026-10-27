package com.mftb.admin.dto;

import lombok.Data;

/**
 * 通知渠道保存参数
 */
@Data
public class SysNotificationChannelSaveDTO {
    /** 渠道名称 */
    private String name;
    /** 平台类型：dingtalk / wecom / feishu */
    private String channel;
    /** Webhook 地址 */
    private String webhookUrl;
    /** 加签密钥 */
    private String secret;
    /** 默认@手机号（逗号分隔） */
    private String atMobiles;
    /** 是否启用 */
    private Integer enabled;
    /** 是否为默认渠道 */
    private Integer isDefault;
    /** 绑定场景（逗号分隔） */
    private String scenarios;
    /** 备注 */
    private String remark;
}
