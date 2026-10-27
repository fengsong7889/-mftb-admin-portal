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
 * 会议纪要投递明细：一个批次里群占一行、每个收件人各占一行，同时充当重试队列。
 *
 * <p>三条硬口径：
 * <ul>
 *   <li><b>{@code receiverUserId} 用 0 而不是 NULL 承载群行</b>：唯一键
 *       {@code (send_id, target_type, receiver_user_id)} 在 MySQL 里对 NULL 不去重，
 *       拿 NULL 占位等于同一批次能重复插多条群投递（群里刷屏）；</li>
 *   <li><b>只存钉钉用户 ID，不存手机号</b>：留痕表会被列表页整批读出，敏感字段一进去就再也收不住；</li>
 *   <li><b>skipped 必须带原因</b>：与会议邀约同一口径——「状态说没发、没人说为什么」等于让人去猜。</li>
 * </ul>
 */
@Data
@TableName("biz_meeting_minutes_delivery")
public class MeetingMinutesDelivery {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long sendId;

    /** 冗余纪要ID：按纪要查明细不绕批次表 */
    private Long minutesId;

    private Long bookingId;

    /** GROUP / USER，见 MeetingConstants.MINUTES_TARGET_* */
    private String targetType;

    /** 收件人 sys_user.id；群投递固定 {@link com.mftb.admin.constant.MeetingConstants#MINUTES_GROUP_RECEIVER} */
    private Long receiverUserId;

    /** 收件人姓名快照；群行存渠道名称 */
    private String receiverName;

    private String receiverEmpNo;

    private String receiverDepartment;

    private String receiverDingtalkId;

    private Long groupChannelId;

    /** USER 行占工作通知场景；GROUP 行走 webhook，不占场景 */
    private String scenario;

    /** pending/sending/success/skipped/failed */
    private String sendStatus;

    private Integer retryCount;

    private LocalDateTime nextRetryAt;

    /** 失败或跳过原因（面向排查，不含凭据与手机号） */
    private String errorMsg;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
