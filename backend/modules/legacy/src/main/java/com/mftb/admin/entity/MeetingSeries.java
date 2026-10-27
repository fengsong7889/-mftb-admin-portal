package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 周期会议系列实体（模板 + 物化进度）。
 *
 * <p>实例在创建时**一次性物化**成 {@code biz_meeting_booking} 行（写 {@code series_id}+{@code series_seq}），
 * 本表只存模板与两个计数。读时虚拟展开看起来更省空间，实际会把三件必需的能力都做坏：
 * 单次签到、单次取消、单次改期都要一份可独立修改的事实；虚拟展开只能靠"覆盖记录"补齐，
 * 而覆盖记录的复杂度最终会重新长成一张实例表。
 *
 * <p>{@code generatedCount} 与 {@code skippedCount} 并列存储：冲突被跳过的场次必须可查，
 * 否则"每周三例会"会在某个月悄悄少两场，而没有任何地方说明为什么。
 *
 * <p>{@code activeSeriesNo}（软删感知生成列）故意不映射，理由同 {@link MeetingRoom}。
 */
@Data
@TableName("biz_meeting_series")
public class MeetingSeries {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 系列编号：MS + YYYYMMDD + 4 位 */
    private String seriesNo;

    /** daily/weekly */
    private String freq;

    /** 每 N 天 / 每 N 周 */
    private Integer intervalN;

    /** weekly 生效的星期集合，逗号包裹 ,1,3,5,（1=周一，与 java.time.DayOfWeek.getValue 同口径） */
    private String byWeekday;

    private LocalTime timeStart;

    private LocalTime timeEnd;

    private LocalDate startDate;

    /** 与 occurrenceLimit 双上限，任一先到即止；为 NULL 时只受 occurrenceLimit 约束 */
    private LocalDate endDate;

    private Integer occurrenceLimit;

    /** 实际物化实例数（冲突跳过不计） */
    private Integer generatedCount;

    /** 因冲突被跳过的场次数 */
    private Integer skippedCount;

    private Long roomId;

    private String roomNo;

    private String roomName;

    private String roomLocation;

    private String title;

    private String description;

    private String onlineMeetingUrl;

    private String bizType;

    private Long bizId;

    private String bizNo;

    private String bizUrl;

    /** 参会人快照 JSON：新建实例沿用模板名单而不是回查 HR，避免人走了会议名单跟着变 */
    private String attendeeJson;

    private Long organizerId;

    private String organizerEmpNo;

    private String organizerName;

    private Long departmentId;

    private String departmentName;

    /** active/cancelled */
    private String status;

    /** 取消时选的那档：this/future/all */
    private String cancelledScope;

    private String cancelReason;

    private Long cancelledBy;

    private LocalDateTime cancelledAt;

    private String requestKey;

    private String requestHash;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;

    private Integer version;
}
