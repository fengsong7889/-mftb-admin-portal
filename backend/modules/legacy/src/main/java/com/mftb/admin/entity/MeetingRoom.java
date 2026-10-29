package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
import java.time.LocalTime;

/**
 * 会议室档案实体（会议域的资源台账）。
 *
 * <p>规则采用「全局默认 + 房间覆盖」两层：{@code bookableStartTime}/{@code minDuration} 等
 * 允许为 NULL，NULL 表示"未单独配置"，由 {@code MeetingRuleService} 回落到 sys_config 的
 * {@code meeting_*} 默认值。这里不能用 0 或空串当"未配置"——把上限填 0 会让所有预约都被拒。
 *
 * <p>{@code activeRoomNo}（软删感知生成列）故意不映射：MyBatis-Plus 按实体字段拼 INSERT 列表，
 * 生成列写进去会报"The generated column cannot be set"。
 */
@Data
@TableName("biz_meeting_room")
public class MeetingRoom {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 会议室编号，如 MR-1F-01；软删感知唯一 */
    private String roomNo;

    private String roomName;

    /** 所在城市：跨城办公场景下防订错；档案列 NOT NULL DEFAULT ''，空串=未填 */
    private String city;

    private String campus;

    private String building;

    /** 楼层：floor 是 SQL 保留字风险列名，Java 侧统一用 floorCode */
    private String floorCode;

    private String locationDesc;

    /** 容纳人数：现场座位参考（列表/超容量提醒用），不作为邀约人数门槛——参会人可能线上加入 */
    private Integer capacity;

    /** 设备代码，前后带逗号的包裹格式：,PROJECTION,WHITEBOARD, */
    private String facilities;

    /** 照片地址 JSON 数组 */
    private String photoUrls;

    /** active/maintenance/disabled */
    private String status;

    /** 是否允许预约：0=仅展示不可订 */
    private Integer bookable;

    private LocalTime bookableStartTime;

    private LocalTime bookableEndTime;

    /**
     * 以下规则列均可空：NULL = 继承通用规则，非 NULL = 房间专属值。
     * <p>注意 0 是明确值（如提醒 0 分钟=不提醒），不能用「>0」判断是否配置，只能判 NULL。
     */
    private Integer minDuration;

    private Integer maxDuration;

    /** 最远可预约天数（NULL=继承通用） */
    private Integer advanceDays;

    /** 最少提前分钟数（NULL=继承通用，0=允许即时预约） */
    private Integer minLeadMinutes;

    /** 时间粒度分钟（NULL=继承通用） */
    private Integer granularityMinutes;

    /** 默认时长分钟（NULL=继承通用） */
    private Integer defaultDuration;

    /** 开始前提醒分钟（NULL=继承通用，0=不提醒） */
    private Integer remindMinutes;

    /** 可提前签到分钟（NULL=继承通用） */
    private Integer checkinOpenMinutes;

    /** 是否需要签到保留（M2 生效，本期只维护） */
    private Integer checkinRequired;

    private Integer releaseAfterMinutes;

    /** 忙闲视图是否脱敏主题：1=只显示已占用 */
    private Integer hideTitle;

    /** 预留：房间是否需要审批，本期服务端不读取 */
    private Integer approvalRequired;

    /** 房间管理员 sys_user.id，逗号包裹：,12,35, */
    private String adminUserIds;

    private String remark;

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
