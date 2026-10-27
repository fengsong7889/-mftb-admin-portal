package com.mftb.admin.dto;

import lombok.Data;

/**
 * 语言翻译完成率视图对象
 */
@Data
public class TranslationCoverageVO {

    /** 语言代码 */
    private String langCode;

    /** 字段总数 */
    private long total;

    /** 该语言已翻译（非空）的字段数 */
    private long translated;

    /** 完成率 0~1 */
    private double rate;

    /** 配置状态: not_configured/partial/ready */
    private String status;
}
