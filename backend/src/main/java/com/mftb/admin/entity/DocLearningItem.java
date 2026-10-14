package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 學習路徑條目實體（路徑內的有序文檔清單） */
@Data
@TableName("doc_learning_path_item")
public class DocLearningItem {

    @TableId
    private Long id;

    /** 所屬路徑 ID */
    private Long pathId;

    /** 文檔 ID（doc_node.id） */
    private Long nodeId;

    /** 路徑內順序（小在前） */
    @TableField("sort_order")
    private Integer sortOrder;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
