package com.mftb.admin.dto;

import lombok.Data;

/**
 * 语言翻译完成率视图对象
 */
@Data
public class TranslationCoverageVO {

    /** 语言代码 */
    private String langCode;

    /**
     * 需译全集：前端语言包镜像的文案 key 并上 {@code sys_translation} 已有字段。
     * <p>旧口径只算库里记录数，把「前端有但没入库」的词条整段排除在分母外，
     * 六语都能刷出 ~100%；而简体中文当时实际只能解析 51.4%。完成率必须拿全站口径当真值。
     */
    private long total;

    /** 该语言已翻译（非空）的字段数 */
    private long translated;

    /** 完成率 0~1 */
    private double rate;

    /** 配置状态: not_configured/partial/ready */
    private String status;

    /** 库里现有记录数（仅供页面解释 total 与旧口径的差） */
    private long dbTotal;

    /** 语言包镜像的文案 key 数；0 表示镜像不可用，此时 total 退回只按库记录算 */
    private long mirrorTotal;

    /** 镜像里有、但库里还没入库的 key 数（前端加了文案没跑同步就是它） */
    private long missingInDb;
}
