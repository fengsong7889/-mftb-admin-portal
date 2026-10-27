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
 * 参会人实体（邀约对象与响应状态）。
 *
 * <p>组织者也会落一行 {@code attendeeType=organizer}：这样"我的日程"只需 JOIN 本表，
 * 不必在 SQL 里到处拼「我发起的 OR 我参与的」两套条件——两套条件迟早漂移到一边漏人。
 *
 * <p>外部参会人（客户/面试者）无系统账号，{@code userId} 为 NULL，只留姓名快照；
 * 软删感知唯一键 {@code active_attendee} 对 NULL 不参与约束，因此允许多个外部人。
 */
@Data
@TableName("biz_meeting_attendee")
public class MeetingAttendee {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long bookingId;

    /** sys_user.id；外部人员为 NULL */
    private Long userId;

    /** 在册工号快照 */
    private String empNo;

    private String name;

    private String departmentName;

    /** organizer/required/optional/external */
    private String attendeeType;

    /** pending/accepted/declined/invalid */
    private String response;

    private LocalDateTime respondAt;

    /** 邀约投递态：pending/sent/skipped/failed */
    private String notifyStatus;

    /** 投递说明，如「未綁定釘釘」「場景未啟用」 */
    private String notifyNote;

    private LocalDateTime checkinAt;

    /** 失效原因（如「離職」）：历史会议只标不改 */
    private String invalidReason;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
