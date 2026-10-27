package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 通知出站留痕实体（映射 {@code rdm_notify_log}，源于 204 建表）。
 * <p>Batch 4（rdm:schema:v3.3 / 238_rdm_batch4_migration.sql）为该表新增了「事件级去重」契约列：
 * {@code object_type / object_id / event_version / receiver_user_id / dedupe_key}，
 * 并以 {@code uk_rdm_notify_dedupe(dedupe_key)} + {@code ck_rdm_notify_dedupe} 保证
 * 「同一事件同一版本同一接收人只出站一次」，旧行 dedupe_key 为 NULL、不回填。
 * <p>本实体本轮只作为**契约载体**：承载基础标识列与上述 5 个新列。
 * 现有的重试队列列（scenario/title/content/at_mobiles/receivers/attempts/next_retry_at/channel_name）
 * 仍由 {@code RdmNotifyDispatcher}/{@code RdmSlaScheduler}/{@code RdmNotifyRetryJob} 的裸 SQL 路径拥有，
 * 不在本实体重复映射；发送与去重逻辑留待任务 22 接线。
 * <p>{@code event_version} 约定：{@code VERSION:<并发版本>} 或 {@code DATE:<yyyy-MM-dd>}。
 */
@Data
@TableName("rdm_notify_log")
public class RdmNotifyLog {

    @TableId
    private Long id;

    /** 需求ID */
    private Long reqId;

    /** 事件编码（见 RdmConstants.EVENT_*） */
    private String eventCode;

    /** 渠道：DINGTALK/INBOX */
    private String channel;

    /** 接收人姓名（历史列，仅保留给旧行） */
    private String receiverName;

    /** 接收人工号（历史列，仅保留给旧行） */
    private String receiverEmpNo;

    /** 发送结果：success/skipped/failed */
    private String sendStatus;

    /** 失败原因 */
    private String errorMsg;

    /* ==================== Batch 4 事件级去重契约列（238 新增） ==================== */

    /** 去重对象类型（如 release_batch/supplementary_verification） */
    private String objectType;

    /** 去重对象ID */
    private Long objectId;

    /** 事件版本：VERSION:<并发版本> 或 DATE:<yyyy-MM-dd> */
    private String eventVersion;

    /** 接收人（认证 SysUser.id） */
    private Long receiverUserId;

    /** 新事件规范化摘要 CHAR(64)；旧行为 NULL、不回填，由 uk_rdm_notify_dedupe 保证唯一 */
    private String dedupeKey;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    /** 逻辑删除标记 */
    @TableLogic
    private Integer deleted;
}
