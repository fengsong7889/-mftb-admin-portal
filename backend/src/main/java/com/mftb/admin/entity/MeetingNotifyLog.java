package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 会议通知投递留痕（同时是重试队列）。
 *
 * <p>{@code UNIQUE(booking_id, event_code, receiver_user_id)} 是「开始前提醒只发一次」的硬保证：
 * 提醒 Job 每分钟扫一遍到期会议，同一场会同一接收人第二次插入必撞唯一键，
 * 靠 {@code MeetingNotifyLogMapper#upsertRetry} 只回写失败信息，不会重复推送。
 *
 * <p>{@code receiverDingtalkId} 落快照而不是运行时再查：绑定关系今天有明天无时，
 * 排查「为什么他没收到」必须能还原投递那一刻用的是哪个钉钉账号。
 * 注意只存钉钉用户 ID，不存手机号（日志与错误返回都不得出现敏感信息）。
 */
@Data
@TableName("biz_meeting_notify_log")
public class MeetingNotifyLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long bookingId;

    private String bookingNo;

    /** 见 MeetingConstants.NOTIFY_EVT_* */
    private String eventCode;

    /** meeting_invite / meeting_remind / meeting_ops */
    private String scenario;

    /** DINGTALK / INBOX */
    private String channel;

    private Long receiverUserId;

    private String receiverName;

    private String receiverEmpNo;

    private String receiverDingtalkId;

    /** pending/sending/success/skipped/failed */
    private String sendStatus;

    private Integer retryCount;

    private LocalDateTime nextRetryAt;

    /** 失败或跳过原因（面向排查，不含敏感值） */
    private String errorMsg;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
