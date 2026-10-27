package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 授权变更审计日志视图对象（sys_permission_audit_log 读模型）。
 * <p>before/after 快照为 JSON 字符串原文，由前端按需解析展示 diff。
 */
@Data
public class PermissionAuditVO {

    private Long id;
    /** 授权对象类型: role / department */
    private String targetType;
    private Long targetId;
    /** 目标名称快照 */
    private String targetName;
    /** 业务系统编码；跨系统操作为 null */
    private String systemCode;
    /** 变更类型: GRANT/REVOKE/UPDATE/DELETE/COPY/BIND/STATUS */
    private String changeType;
    /** 变更前快照 JSON 字符串 */
    private String beforeSnapshot;
    /** 变更后快照 JSON 字符串 */
    private String afterSnapshot;
    /** 操作人 */
    private String operator;
    /** 记录时间（全局 Jackson 序列化为 epoch 毫秒） */
    private LocalDateTime createdAt;
}
