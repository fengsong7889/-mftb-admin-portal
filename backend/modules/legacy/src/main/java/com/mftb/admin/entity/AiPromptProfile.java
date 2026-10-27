package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 助手回答骨架/领域规则（版本化）。 */
@Data
@TableName("ai_prompt_profile")
public class AiPromptProfile {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String profileKey;
    private String name;
    private String domain;
    private String responseSkeleton;
    private String extraRules;
    private String status;
    private Integer activeFlag;
    private Integer version;
    private LocalDateTime publishedAt;
    private String publishedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String updatedBy;
}
