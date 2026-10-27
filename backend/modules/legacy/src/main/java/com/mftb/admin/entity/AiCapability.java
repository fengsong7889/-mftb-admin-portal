package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 能力清单（prompt 元数据；启停仍在 ai_tool_policy）。 */
@Data
@TableName("ai_capability")
public class AiCapability {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String toolKey;
    private String displayName;
    private String domain;
    private String promptDescription;
    private String useWhen;
    private String avoidWhen;
    private String examplesJson;
    private Integer sort;
    private String updatedBy;
    private LocalDateTime updatedAt;
}
