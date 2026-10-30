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
 * 会议纪要 AI 提取请求（幂等登记 + 结果恢复 + 计量审计）。
 *
 * <p>一次提取 = 一行，{@code uk(operator_user_id, request_key)} 钉住重放：
 * 双击/重连不会重复调模型也不会重复扣费。库里刻意不映射生成列
 * {@code active_operator_id}（每用户仅一条处理中，由数据库唯一键把守）。
 *
 * <p>状态与计量都是「只前进」的小整型，禁止散落魔法值：
 * 模型调用不放在数据库长事务里，预占成功才发起，结果与用量先落库再返回。
 * 原文快照与结果 7 天后清空，计量元数据保留 180 天。
 */
@Data
@TableName("biz_meeting_minutes_ai_extraction")
public class MeetingMinutesAiExtraction {

    /** 0 处理中 */
    public static final int STATUS_PROCESSING = 0;
    /** 1 成功 */
    public static final int STATUS_SUCCEEDED = 1;
    /** 2 失败（未消耗或已释放） */
    public static final int STATUS_FAILED = 2;
    /** 3 结果未知（已发起但拿到不到确定结论，不自动重放） */
    public static final int STATUS_UNKNOWN = 3;
    /** 4 结果过期 */
    public static final int STATUS_EXPIRED = 4;

    public static final int BILLING_NONE = 0;
    public static final int BILLING_RESERVED = 1;
    public static final int BILLING_SETTLED = 2;
    public static final int BILLING_RECONCILE = 3;
    public static final int BILLING_RELEASED = 4;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long bookingId;

    private Long noteId;

    private Long operatorUserId;

    private String requestKey;

    private String requestHash;

    private Integer noteVersion;

    private String sourceHash;

    /** 提取原文与人员标记快照（7 天后清空） */
    private String sourceSnapshot;

    private Long baseMinutesId;

    private Integer baseMinutesVersion;

    private LocalDate meetingDate;

    private String timezone;

    private Integer status;

    private String promptVersion;

    private Integer schemaVersion;

    private String modelKey;

    /** 校验通过的结构化建议 + 注解 + 问题清单（JSON） */
    private String resultJson;

    private String errorCode;

    private Integer billingStatus;

    /** 预占期别/单价/币种快照，不含供应商凭据 */
    private String billingContextJson;

    /** 只存用量，不存供应商原始响应 */
    private String usageJson;

    private Long appliedMinutesId;

    private Integer appliedMinutesVersion;

    private String appliedKeysJson;

    private LocalDateTime appliedAt;

    private LocalDateTime startedAt;

    private LocalDateTime finishedAt;

    private LocalDateTime resultExpiresAt;

    private LocalDateTime metadataExpiresAt;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
