package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 需求附件实体（截图/文档/原型）
 */
@Data
@TableName("rdm_attachment")
public class RdmAttachment {

    @TableId
    private Long id;

    /** 需求ID */
    private Long reqId;

    /** 业务类型: REQ/COMMENT/ACCEPT/CHANGE */
    private String bizType;

    /** 文件名 */
    private String fileName;

    /** 存储路径或 data URL */
    private String storagePath;

    /** MIME 类型 */
    private String fileType;

    /** 字节数 */
    private Long fileSize;

    /** 上传人ID */
    private Long uploaderUserId;

    /** 上传人姓名 */
    private String uploaderName;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
