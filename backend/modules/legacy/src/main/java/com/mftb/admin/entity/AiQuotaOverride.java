package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 员工独立额度授予实体（审批下发）
 *
 * 员工通过 AI 使用申请审批获得的「独立/额外额度」：
 * - 不修改部门/职位/角色等组织织维度配置，仅对本人生效；
 * - 临时额度（effective_type=temporary）查询时按 expire_at 动态过滤，无需定时任务；
 * - source_request_id 回链审批记录，授权来源可审计。
 */
@Data
@TableName("ai_quota_override")
public class AiQuotaOverride {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 员工 ID (sys_user.id) */
    private Long userId;

    /** 员工账号（冗余，用量聚合键） */
    private String username;

    /** 来源申请 ID (ai_access_request.id) */
    private Long sourceRequestId;

    /** 限定模型 ID（NULL=全部模型） */
    private Long modelId;

    /** 限额类型: token/request */
    private String quotaType;

    /** 限额值 */
    private BigDecimal quotaValue;

    /** 限额周期: daily/monthly */
    private String quotaPeriod;

    /** 生效类型: permanent=永久 temporary=临时 */
    private String effectiveType;

    /** 生效时间 */
    private LocalDateTime effectiveAt;

    /** 临时额度到期时间（NULL=永久） */
    private LocalDateTime expireAt;

    /** 超阈动作: reject/approve/downgrade */
    private String overLimitAction;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

    private String createdBy;
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
