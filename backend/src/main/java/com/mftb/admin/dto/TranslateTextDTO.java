package com.mftb.admin.dto;

import lombok.Data;

/**
 * 单文本翻译请求（不持久化，仅返回翻译结果）
 */
@Data
public class TranslateTextDTO {

    /** 源文本 */
    private String text;

    /** 目标语言代码，默认 en */
    private String targetLang;
}
