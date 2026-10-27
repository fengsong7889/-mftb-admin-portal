package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 助手快捷提问：按系统/角色收敛，首页对话底部展示。 */
@Data
@TableName("ai_quick_prompt")
public class AiQuickPrompt {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** common / rdm / finance / eam / hr */
    private String domain;

    /** 为空表示全系统可见 */
    private String systemCode;

    /** 为空表示全角色可见；否则命中角色编码才展示 */
    private String roleCode;

    private String question;

    private Integer sort;

    /** 1=启用 0=停用 */
    private Integer enabled;

    private String updatedBy;

    private LocalDateTime updatedAt;
}
