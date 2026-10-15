package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 幂等请求日志实体（Batch 2 / Phase 1A）。
 * <p>分层并行下的写接口（冻结范围/范围变更/跨交付项依赖）需支持客户端重试而不产生副作用：
 * 以 {@code request_id} 唯一键缓存首次结果，重复请求直接回放，避免重复推进版本或重复写依赖。
 */
@Data
@TableName("rdm_idempotent_log")
public class RdmIdempotentLog {

    @TableId
    private Long id;

    /** 请求幂等ID */
    private String requestId;

    /** 业务类型 */
    private String bizType;

    /** 缓存结果（JSON 文本） */
    private String resultJson;

    /* ==================== Batch 3 原子幂等绑定列（rdm:schema:v3.2 / 237） ====================
     * 由 RdmIdempotentService.executeOnce 使用：以 request_id 列写入
     * SHA-256(userId|bizType|resourceKey|clientRequestId) 复用既有唯一索引 uk_request_id 做原子占位；
     * 以下绑定列受 CHECK 约束 ck_rdm_idempotent_binding 保护（status=processing/completed 时必须全部非空）。
     * 旧 V1/V2 调用方仍走 request_id=clientRequestId、status=legacy，不回填以下列。 */

    /** 认证用户ID（跨用户不得回放）；旧日志为 NULL */
    private Long userId;

    /** 资源键（被保护的业务资源标识） */
    private String resourceKey;

    /** 客户端幂等请求ID */
    private String clientRequestId;

    /** 请求体规范化稳定序列化后的 SHA-256 CHAR(64)，用于内容冲突判定 */
    private String requestHash;

    /** 幂等状态：legacy（旧路径）/processing（占位执行中）/completed（已完成可回放） */
    private String status;

    /** 业务完成时间 */
    private LocalDateTime completedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
