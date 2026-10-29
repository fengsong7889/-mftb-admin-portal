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
 * 会议预约单实体（会议室的占用事实）。
 *
 * <p>三条硬口径：
 * <ul>
 *   <li><b>区间左闭右开</b>：{@code startTime <= t < endTime} 才算被占用，
 *       10:00–11:00 与 11:00–12:00 是相邻不是冲突。该口径必须与
 *       {@code MeetingBookingMapper#findConflicts} 的重叠 SQL 与前端忙闲视图一致；</li>
 *   <li><b>人员/部门/房间全部存快照</b>：员工改名、房间改名不得改写历史会议，
 *       否则使用率报表与审计轨迹会在某一天集体变成另一个名字；</li>
 *   <li><b>组织者从 JWT 取</b>：请求体里没有 organizerId 的位置，防止伪造发起人越权代订。</li>
 * </ul>
 *
 * <p>{@code activeBookingNo} / {@code activeSlot} 是软删感知生成列，故意不映射进实体。
 * {@code seriesId} / {@code seriesSeq} 为 M2 周期会议预留，单场会议恒为 NULL。
 */
@Data
@TableName("biz_meeting_booking")
public class MeetingBooking {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 会议单号：MT + YYYYMMDD + 4 位 */
    private String bookingNo;

    private String title;

    /** general/rdm_review/interview/training */
    private String bizType;

    /** 关联业务对象ID（如 rdm 需求ID） */
    private Long bizId;

    /** 关联业务对象编号快照 */
    private String bizNo;

    /** 关联业务对象跳转链接 */
    private String bizUrl;

    private Long roomId;

    private String roomNo;

    private String roomName;

    /** 园区/楼栋/楼层拼接快照，通知卡片与列表直接展示 */
    private String roomLocation;

    private Long organizerId;

    /** 在册工号快照（MFxxxxx） */
    private String organizerEmpNo;

    private String organizerName;

    private Long departmentId;

    private String departmentName;

    /** 代订的实际使用人（M2 生效） */
    private Long delegateForId;

    private String delegateForName;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private Long seriesId;

    private Integer seriesSeq;

    /** 参会人数（含组织者与外部人员）：与房间容量比对 */
    private Integer attendeeCount;

    private String description;

    private String onlineMeetingUrl;

    /** 外部参会人姓名快照，逗号分隔 */
    private String externalAttendees;

    /** booked/checked_in/finished/cancelled/released */
    private String status;

    private String cancelReason;

    private Long cancelledBy;

    private LocalDateTime cancelledAt;

    private LocalDateTime checkinAt;

    private Long checkinBy;

    /**
     * 预约时冻结的生效规则快照（JSON）：记录预约当时各行生效值与来源及配置版本。
     * <p>为什么需要：规则一改就改历史会议，等于把已约好的会按新规则重判；
     * 存量必须保持「预约时那一版」，所以快照由服务端写入、前端不传。
     */
    private String ruleSnapshot;

    /** 提醒时刻（服务端按快照算好，0=不提醒则为 NULL）：提醒 Job 直接按此列取数，不再读最新配置 */
    private LocalDateTime remindAt;

    /** 签到开放时刻（服务端按快照算好）：签到窗口与详情页按钮一律读此列 */
    private LocalDateTime checkinOpenAt;

    /** 未签到自动释放截止时刻（不需要签到保留时为 NULL）：释放 Job 直接按此列取数 */
    private LocalDateTime releaseDeadlineAt;

    /** 预约时是否需签到保留（0/1 快照）：每日收尾判定爽约读此列，不读房间最新开关 */
    private Integer checkinRequiredSnapshot;

    private LocalDateTime actualStartAt;

    private LocalDateTime actualEndAt;

    private LocalDateTime releaseAt;

    /** 行政手动释放操作人；自动释放为 NULL（区分两种释放的事实） */
    private Long releaseById;

    private String releaseReason;

    /** 爽约：占过窗口没来 */
    private Integer noShowFlag;

    /** 预留：审批结论，本期恒为 not_applicable */
    private String approvalOutcome;

    /** 预留：关联 OA 流程编号 */
    private String flowNo;

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
