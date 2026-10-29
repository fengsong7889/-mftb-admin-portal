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
 * 会议纪要发送批次：一次"发送"动作 = 一批（0/1 个群 + N 个收件人）。
 *
 * <p>为什么要存两份快照：
 * <ul>
 *   <li>{@code contentSnapshot} 是发出瞬间的结构化正文，免登页与"查看本批内容"都读它——
 *       纪要后来被改过，收件人点开的也必须还是发给他的那一版，否则消息与链接互相否定；</li>
 *   <li>{@code markdownSnapshot} 是真正投出去的卡片正文（可能被长度截断），
 *       排查"群里那条到底写了什么"时只能靠它，不能靠事后重新渲染。</li>
 * </ul>
 *
 * <p>{@code batchSeq} 从 1 递增并进卡片尾注：钉钉对同一员工当天相同内容只投一条，
 * 没有批次标记的"再发一次"会被渠道静默去重，用户以为发了其实没发。
 */
@Data
@TableName("biz_meeting_minutes_send")
public class MeetingMinutesSend {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long minutesId;

    /** 新版卡片绑定正式版，旧批次保持 NULL 并继续读取原快照。 */
    private Long revisionId;
    private String messageType;
    private String buttonTitle;
    @lombok.ToString.Exclude
    private String buttonUrl;
    private String templateVersion;
    private String requestHash;

    /** 冗余会议单ID：按会议查发送记录不必绕纪要表 */
    private Long bookingId;

    private String bookingNo;

    private String minutesNo;

    /** 第几批，从 1 递增 */
    private Integer batchSeq;

    private String title;

    private String contentSnapshot;

    private String markdownSnapshot;

    /** 工作通知场景，见 MeetingConstants.SCENARIO_MINUTES */
    private String scenario;

    /** 群机器人渠道 sys_notification_channel.id；null=本批不发群 */
    private Long groupChannelId;

    /** 渠道名称快照：渠道改名或被删后仍要读得出"当时发给了谁" */
    private String groupChannelName;

    private Integer receiverCount;

    /** 本批链接使用的令牌版本：低于纪要当前 tokenVersion 即已作废 */
    private Integer tokenVersion;

    private LocalDateTime linkExpireAt;

    /** 单批次链接作废：0=有效 1=已作废（不影响其他批次） */
    private Integer linkRevoked;

    /** pending/sending/success/partial/failed/skipped */
    private String sendStatus;

    private Integer successCount;

    private Integer failedCount;

    private Integer skippedCount;

    /** 批次级失败原因（明细各自的原因在 delivery 表） */
    private String errorMsg;

    private Long operatorId;

    private String operatorEmpNo;

    private String operatorName;

    /** 幂等键：双击不会长出两个批次 */
    private String requestKey;

    private LocalDateTime sentAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
