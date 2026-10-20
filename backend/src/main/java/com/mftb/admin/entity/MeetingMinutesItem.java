package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 纪要可跟踪事项（行动项 / 跟进事项）。
 *
 * <p>与 content_json 的分工：JSON 存"会议内容"（议题/缺席/下次会议/备注），事项独立成行，
 * 因为事项要能被负责人单独更新状态、被逾期作业按行扫描、被完成通知按行引用。
 * 塞回 JSON 则每次都整行覆盖，两个人同时更新必然互相抹掉。
 *
 * <p>{@code seq} 在同类内从 1 连续排列，唯一键 (minutes_id, kind, seq) 让"保存时 upsert"成为可能：
 * 内容与负责人按位置覆盖，状态与处理结果保留（编辑纪要不能把别人填的处理进度清掉）。
 */
@Data
@TableName("biz_meeting_minutes_item")
public class MeetingMinutesItem {

    public static final String KIND_ACTION = "ACTION";
    public static final String KIND_FOLLOW = "FOLLOW";

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_DONE = "done";

    /** 处理结果：完成 / 部分完成 / 无法完成（done 时必填） */
    public static final String RESULT_COMPLETED = "completed";
    public static final String RESULT_PARTIAL = "partial";
    public static final String RESULT_CANNOT = "cannot";

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long minutesId;

    /** 冗余会议ID：按会议查待办不绕纪要表 */
    private Long bookingId;

    /** ACTION=行動項 FOLLOW=跟進事項 */
    private String kind;

    private Integer seq;

    private String content;

    private Long ownerUserId;

    private String ownerName;

    private String ownerEmpNo;

    /** 完成时限；NULL=未定时限，不参与逾期扫描 */
    private LocalDate dueDate;

    private String status;

    /** completed/partial/cannot */
    private String result;

    /** 结果说明；cannot 必填 */
    private String resolutionNote;

    private LocalDateTime doneAt;

    private Long doneBy;

    private String doneByName;

    /** 最近一次逾期提醒时间：同一天只提醒一次 */
    private LocalDateTime lastNotifiedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    /** 事项属于纪要正文：保存时物理删除多余行，不做逻辑删除（唯一键含 seq，留软删会挡后续 upsert） */
    private Integer deleted;
}
