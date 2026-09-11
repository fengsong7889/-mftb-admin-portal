package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 倉庫 / 存放位置實體（樹形：倉庫/樓層/辦公室）
 */
@Data
@TableName("biz_eam_location")
public class EamLocation {

    @TableId
    private Long id;

    /** 位置編碼（唯一） */
    private String code;

    /** 位置名稱 */
    private String name;

    /** 父級 ID，0 為頂級 */
    private Long parentId;

    /** 類型：warehouse / floor / room */
    private String type;

    /** 排序 */
    private Integer sort;

    /** 地址 */
    private String address;

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
