package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 資產分類實體（樹形，含參數模板）
 */
@Data
@TableName("biz_eam_category")
public class EamCategory {

    @TableId
    private Long id;

    /** 分類編碼（唯一，如 0101 / 010101） */
    private String code;

    /** 分類名稱 */
    private String name;

    /** 父級 ID，0 為頂級 */
    private Long parentId;

    /** 狀態：enabled / disabled */
    private String status;

    /** 該分類下資產需填寫的參數模板 JSON */
    private String paramTemplate;

    /** 排序 */
    private Integer sort;

    /** 備註 */
    private String remark;

    /** 最後更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableLogic
    private Integer deleted;
}
