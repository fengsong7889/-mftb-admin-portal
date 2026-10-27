package com.mftb.admin.dto;

import lombok.Data;

import java.util.Map;

/**
 * 翻译字段请求（新增/编辑）
 */
@Data
public class TranslationRequest {

    /** 字段Key（全局唯一；留空时后端自动生成） */
    private String fieldKey;

    /** 字段名称（业务人员识别用） */
    private String fieldName;

    /** 分类: common/status/action/menu/biz/ui */
    private String category;

    /** 翻译内容: langCode → 译文 */
    private Map<String, String> translations;

    /** 来源: manual=手动新增 sync=系统同步（默认 manual） */
    private String source;
}
