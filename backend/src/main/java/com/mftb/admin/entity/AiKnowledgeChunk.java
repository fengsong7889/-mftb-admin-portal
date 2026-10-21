package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** AI 知识库分块：检索单元，doc_id 关联文档；全文索引由迁移探测创建。 */
@Data
@TableName("ai_knowledge_chunk")
public class AiKnowledgeChunk {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long docId;

    private Integer chunkNo;

    private String content;

    private LocalDateTime createdAt;
}
