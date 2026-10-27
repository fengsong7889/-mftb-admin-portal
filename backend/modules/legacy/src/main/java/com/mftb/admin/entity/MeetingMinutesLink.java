package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 纪要关联：当前纪要引用其它会议的纪要。
 *
 * <p>展示一律用快照（分钟单号/会议主题/时间），{@code linkedMinutesId} 只用于跳转：
 * 被引用的纪要后来被改期、改名甚至被删时，引用方仍要能说清"引自哪场会"。
 */
@Data
@TableName("biz_meeting_minutes_link")
public class MeetingMinutesLink {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long minutesId;

    private Long linkedMinutesId;

    private String linkedMinutesNo;

    private String linkedBookingNo;

    private String linkedTitle;

    private String linkedTimeText;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
