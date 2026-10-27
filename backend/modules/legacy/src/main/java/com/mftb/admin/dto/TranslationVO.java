package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 翻译字段视图对象
 */
@Data
public class TranslationVO {

    private Long id;

    /** 字段Key（全局唯一） */
    private String fieldKey;

    /** 字段名称 */
    private String fieldName;

    /** 分类 */
    private String category;

    /** 翻译内容: langCode → 译文 */
    private Map<String, String> translations;

    /** 来源: manual/sync */
    private String source;

    /** 最后更新人 */
    private String updatedBy;

    private LocalDateTime updatedAt;
}
