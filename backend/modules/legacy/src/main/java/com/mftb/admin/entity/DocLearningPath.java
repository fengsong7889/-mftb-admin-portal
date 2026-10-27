package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 學習路徑實體（新人入職包/培訓清單：有序文檔集合） */
@Data
@TableName("doc_learning_path")
public class DocLearningPath {

    @TableId
    private Long id;

    /** 路徑名稱 */
    private String name;

    /** 路徑說明 */
    private String description;

    /** 1=啟用 0=停用（停用後新人入口隱藏，管理側仍可見） */
    private Integer status;

    /** 排序（小在前） */
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
