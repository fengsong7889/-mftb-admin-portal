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

/**
 * 会议预约黑名单实体（爽约治理）。
 *
 * <p>三条口径写在这里，因为它们决定"这个人今天能不能订房"：
 * <ul>
 *   <li><b>过期不写库</b>：是否生效由 {@code status='active' AND end_date >= 今天} 判出，
 *       不靠每日 Job 把行翻成 expired —— 一天几万行的状态翻转只为记录一个"日期到了"是浪费，
 *       而 Job 漏跑一次就会让人永久被误锁；</li>
 *   <li><b>撤销留行</b>：{@code status=revoked} 而不是删行，删行等于毁掉处置记录，
 *       下次同一个人在同一天被再次拉黑时，生成列唯一键不会与历史冲突；</li>
 *   <li><b>统计窗口只有 30 天</b>：见 {@code NO_SHOW_WINDOW_DAYS}，不让一次失约跟着人一辈子。</li>
 * </ul>
 *
 * <p>{@code activeUser}（同一用户只能有一条生效记录）是生成列，故意不映射进实体。
 */
@Data
@TableName("biz_meeting_blacklist")
public class MeetingBlacklist {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    /** 在册工号快照 */
    private String empNo;

    private String name;

    private String departmentName;

    private String reason;

    /** auto/admin */
    private String source;

    /** 判定时近 30 天爽约次数（手动加入为 0） */
    private Integer noShowCount;

    private LocalDate startDate;

    private LocalDate endDate;

    /** active/revoked */
    private String status;

    private Long revokedBy;

    private LocalDateTime revokedAt;

    private String revokeReason;

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
