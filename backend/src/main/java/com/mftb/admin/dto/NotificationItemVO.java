package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 系统通知项视图对象
 * 支持多种通知类型，当前仅 gift_expire（赠送到期提醒），后续可扩展
 */
@Data
public class NotificationItemVO {

    /** 通知唯一 ID */
    private String id;

    /** 通知类型: gift_expire（赠送到期提醒）/ doc_ack_pending（制度待签收） */
    private String type;

    /** 通知标题 */
    private String title;

    /** 通知内容 */
    private String content;

    /** 关联门店ID（可为空） */
    private Long storeId;

    /** 关联门店编号（如 MD000001） */
    private String storeCode;

    /** 关联门店名称 */
    private String storeName;

    /** 关联广告类型 */
    private String adType;

    /** 到期日期（仅 gift_expire 类型） */
    private LocalDate expireDate;

    /** 剩余天数（仅 gift_expire 类型） */
    private Integer daysLeft;

    /** 关联文档节点（doc_ack_pending） */
    private Long docNodeId;

    /** 关联文档修订（doc_ack_pending） */
    private Long docRevisionId;

    /** 制度签收截止日（doc_ack_pending） */
    private LocalDate docDueDate;

    /** 通知生成时间 */
    private String createdAt;
}
