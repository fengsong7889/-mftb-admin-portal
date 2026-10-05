package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 需求沟通记录实体
 */
@Data
@TableName("rdm_comment")
public class RdmComment {

    @TableId
    private Long id;

    /** 需求ID */
    private Long reqId;

    /** 父评论ID（回复） */
    private Long parentId;

    /** 评论内容 */
    private String content;

    /** @ 提醒的用户ID列表（逗号分隔） */
    private String mentionUserIds;

    /** 仅产研可见: 1=业务方不可见 */
    private Integer internalFlag;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
