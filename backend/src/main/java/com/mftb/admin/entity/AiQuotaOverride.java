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
 * 員工獨立額度授予實體（審批下發）
 *
 * 員工通過 AI 使用申請審批獲得的「獨立/額外額度」：
 * - 不修改部門/職位/角色等組織織維度配置，僅對本人生效；
 * - 臨時額度（effective_type=temporary）查詢時按 expire_at 動態過濾，無需定時任務；
 * - source_request_id 回鏈審批記錄，授權來源可審計。
 */
@Data
@TableName("ai_quota_override")
public class AiQuotaOverride {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 員工 ID (sys_user.id) */
    private Long userId;

    /** 員工賬號（冗餘，用量聚合鍵） */
    private String username;

    /** 來源申請 ID (ai_access_request.id) */
    private Long sourceRequestId;

    /** 限定模型 ID（NULL=全部模型） */
    private Long modelId;

    /** 限額類型: token/request */
    private String quotaType;

    /** 限額值 */
    private BigDecimal quotaValue;

    /** 限額週期: daily/monthly */
    private String quotaPeriod;

    /** 生效類型: permanent=永久 temporary=臨時 */
    private String effectiveType;

    /** 生效時間 */
    private LocalDateTime effectiveAt;

    /** 臨時額度到期時間（NULL=永久） */
    private LocalDateTime expireAt;

    /** 超閾動作: reject/approve/downgrade */
    private String overLimitAction;

    /** 狀態: 1=啟用 0=停用 */
    private Integer status;

    private String createdBy;
    private String updatedBy;

    /** 邏輯刪除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
