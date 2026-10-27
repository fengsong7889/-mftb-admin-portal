package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 会议审计事件（追加式事实）。
 *
 * <p>本表没有 {@code deleted} 与更新人列：审计轨迹一旦被业务页面删改，
 * 「谁在什么时候占了哪间房」就重新变成不可证明的事。实体不提供逻辑删除口径，
 * 服务层也没有 update/delete 方法，只有 insert 与查询。
 *
 * <p>{@code requestKey} 与操作人构成唯一键：重复点击或网络重试不得长出两条相同轨迹。
 * 系统动作（自动释放、每日收尾）{@code operatorId} 为 NULL、{@code operatorName} 写 SYSTEM，
 * 人工与机器操作必须分得开。
 */
@Data
@TableName("biz_meeting_event")
public class MeetingEvent {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 预约单 ID；会议室档案类事件为 NULL（改容量/改可预约窗与某场会无关） */
    private Long bookingId;

    /** 改房时用于对比前后；档案事件里它是被操作的那间房 */
    private Long roomId;

    /** 单号快照：会议事件存会议单号，档案事件存会议室编号 */
    private String targetNo;

    /** 见 MeetingConstants.EVENT_* */
    private String eventCode;

    /** 取消/释放必填 */
    private String reason;

    private String beforeJson;

    private String afterJson;

    /** 系统动作为 NULL */
    private Long operatorId;

    /** 系统动作写 SYSTEM */
    private String operatorName;

    private String operatorEmpNo;

    private String requestKey;

    /**
     * 发生时间：由列的 DEFAULT CURRENT_TIMESTAMP 保证。
     * <p>故意不加 {@code @TableField(fill = INSERT)}：全局 MetaObjectHandler 只填
     * createdAt/updatedAt 两个名字，挂上 fill 只会让人误以为有人写过它。
     */
    private LocalDateTime occurredAt;
}
