package com.mftb.admin.dto;

import lombok.Data;

import java.util.Map;

/**
 * 已注册语言视图对象
 */
@Data
public class LanguageVO {

    private Long id;

    /** 语言代码 ISO 639-1 */
    private String code;

    /** 母语名称 */
    private String name;

    /** 国旗 Emoji */
    private String flag;

    /** 各系统语言下的显示名: sysLang → 显示名 */
    private Map<String, String> names;
}
