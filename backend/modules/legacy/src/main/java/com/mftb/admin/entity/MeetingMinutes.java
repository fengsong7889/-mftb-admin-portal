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
 * 会议纪要主体（一场会议一条，正文按模板分区存 JSON）。
 *
 * <p>三条硬口径：
 * <ul>
 *   <li><b>一场会一条</b>：{@code uk_meeting_minutes_booking} 建在软删感知生成列上，
 *      并发双击不会长出第二条并列纪要——两条纪要同时存在时没人说得清哪条是这场会的结论；</li>
 *   <li><b>记录人由服务端从 JWT 落</b>：请求体里没有 recorder* 的位置，
 *      允许前端传记录人等于允许任何人替别人署名记纪要；</li>
 *   <li><b>会议資訊全是快照</b>：主题/时间/房间/组织者写入时定格，
 *      会议后续被改期或房间改名都不得改写已发出的纪要正文。</li>
 * </ul>
 *
 * <p>{@code status=sent} 只表示"至少发过一批"，不是锁版：纪要可以改了再发，
 * 每一批的正文由 {@link MeetingMinutesSend#getContentSnapshot()} 自证。
 * {@code tokenVersion} 递增即让已发出去的免登链接全部失效（作废能力唯一入口）。
 */
@Data
@TableName("biz_meeting_minutes")
public class MeetingMinutes {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 纪要单号：MJ + YYYYMMDD + 4 位 */
    private String minutesNo;

    private Long bookingId;

    private String bookingNo;

    private String meetingTitle;

    /** 会议时间文本快照，如 2026-10-19 10:00 ~ 11:00 */
    private String meetingTimeText;

    private String roomText;

    private String organizerName;

    /** 周期归属快照：单场会议为 NULL，系列纪要导航按它取数 */
    private Long seriesId;

    private Integer seriesSeq;

    private Long recorderUserId;

    private String recorderEmpNo;

    private String recorderName;

    /** 纪要正文 JSON（见 MeetingMinutesContent） */
    private String contentJson;

    /** 摘要（首条结论或首条行动项），列表与钉钉卡片展示 */
    private String digest;

    /** draft/sent，见 MeetingConstants.MINUTES_* */
    private String status;

    private Integer sendCount;

    private LocalDateTime lastSendAt;

    /** 免登链接令牌版本：递增即作废全部历史链接 */
    private Integer tokenVersion;

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

    /**
     * 乐观锁版本：与 MeetingRoom/Vehicle 同一口径，刻意不加 {@code @Version}。
     * <p>引擎已全局注册 OptimisticLockerInnerInterceptor，加了注解会让任何一次 updateById
     * 静默带上版本条件；本域的冲突要在服务层给出可读提示（"纪要已被他人修改，请刷新后重试"），
     * 因此统一用显式 {@code WHERE version = ?} 更新并判影响行数。
     */
    private Integer version;
}
