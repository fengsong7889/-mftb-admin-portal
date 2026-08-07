package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 多语言配置-已注册语言实体
 */
@Data
@TableName("sys_language")
public class SysLanguage {

    @TableId
    private Long id;

    /** 语言代码 ISO 639-1, 如 zh-TW/en/ja/th */
    private String code;

    /** 母语名称, 如 日本語/ภาษาไทย */
    private String nativeName;

    /** 国旗 Emoji */
    private String flag;

    /** 各系统语言下的显示名 JSON, 如 {"zh-TW":"日文","en":"Japanese"} */
    private String namesJson;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

    /** 保留列, 恒为 0; 配置表采用物理删除, 避免逻辑删除行占用 code 唯一键导致重建冲突 */
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
