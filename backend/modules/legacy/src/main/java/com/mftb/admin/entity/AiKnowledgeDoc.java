package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 知识库文档：配置中心维护，按系统归属，保存时切分为检索单元。 */
@Data
@TableName("ai_knowledge_doc")
public class AiKnowledgeDoc {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String title;

    /** common / rdm / finance / eam / hr */
    private String systemCode;

    /** manual / url / file */
    private String sourceType;

    private String content;

    /** active / disabled */
    private String status;

    private Integer chunkCount;

    private String updatedBy;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
