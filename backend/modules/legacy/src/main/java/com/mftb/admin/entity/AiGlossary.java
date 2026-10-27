package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 术语/口径字典。 */
@Data
@TableName("ai_glossary")
public class AiGlossary {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String domain;
    private String term;
    private String aliases;
    private String definition;
    private String formula;
    private String example;
    private Integer promptVisible;
    private String source;
    private String status;
    private Integer sort;
    private String updatedBy;
    private LocalDateTime updatedAt;
}
