/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.List;

/**
 * CPM AI 提取的模型输出结构（仅承载「待校验的原始 JSON」）。
 * <p>字段全为可包装类型且无默认值：缺字段=校验失败，不允许被 POJO 默认值洗成合法。
 * 未知字段 ignoreUnknown 但关键字段缺失一律 invalid——宽松只放在「多给的字段」上，
 * 少给/给错必须显式失败，否则模型幻觉会被反序列化吞掉。
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class CpmAiModelOutput {

    private List<RawItem> items;
    private String summary;
    private List<String> tomorrowPlan;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class RawItem {
        private String title;
        private String category;
        private String status;
        private Integer progress;
        private List<String> sourceRefs;
    }
}
