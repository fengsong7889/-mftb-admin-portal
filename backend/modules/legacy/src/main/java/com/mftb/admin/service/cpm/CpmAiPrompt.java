/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * CPM AI 提取的 Prompt 构造与模型输出结构校验（版本由后端维护）。
 *
 * <p>三层分离沿用纪要定版口径（MinutesAiPrompt 同构）：
 * 固定系统约束（不可被笔记改写）→ 服务端可信上下文（日期/模板词表白名单/既有条目标题）→
 * 用户原文按句编号 s1/s2… 转义后作为数据传入。模型只回段落编号，
 * 原文位置由后端计算——杜绝模型自造来源，也杜绝把任意 userId/日期塞进结果。
 *
 * <p>与纪要的差异只在内核任务：这里是「流水账 → 标准条目」，
 * 因此输出更薄（无负责人/无截止推导），校验更少但一条不让：分类必须命中词表白名单，
 * 数字必须 0-100，条数必须 ≤30——AI 输出永远是不可信输入。
 */
@Component
public class CpmAiPrompt {

    public static final String PROMPT_VERSION = "cpm-ai-v1";
    public static final int SCHEMA_VERSION = 1;
    public static final int OUTPUT_MAX_TOKENS = 4_096;
    public static final int TEMPERATURE = 0;

    private static final Pattern SENTENCE = Pattern.compile("(?<=[。！？!?\\n；;])");
    private static final Set<String> STATUSES = Set.of(
            CpmConstants.STATUS_TODO, CpmConstants.STATUS_DOING,
            CpmConstants.STATUS_DONE, CpmConstants.STATUS_BLOCKED);
    private static final int TITLE_MAX = 200;
    private static final int DETAIL_MAX = 500;

    /** 原文分句并编号：key=s1..n，value=原句（预览回溯与「来源可指认」的基础）。 */
    public Map<String, String> segment(String rawText) {
        Map<String, String> segments = new LinkedHashMap<>();
        int index = 1;
        for (String piece : SENTENCE.split(rawText)) {
            String sentence = piece.trim();
            if (sentence.length() >= 2) {
                segments.put("s" + index++, sentence);
            }
        }
        if (segments.isEmpty()) {
            segments.put("s1", rawText.trim());
        }
        return segments;
    }

    public String systemPrompt() {
        return """
                你是企业「持續績效」系统的工作记录整理引擎。任务：把员工提交的流水账原文整理为标准工作条目。
                硬性规则：
                1. 只允许输出 JSON 对象，不得输出任何解释文字或 Markdown 代码围栏。
                2. items 每项必须包含 title/category/status/progress/sourceRefs 五个字段。
                3. category 必须严格取自给定的分类白名单 key，不得自造、不得翻译、不得改写大小写。
                4. status 只能是 todo/doing/done/blocked；progress 为 0-100 整数，status=done 时必须为 100。
                5. sourceRefs 必须是原文中真实存在的段落编号（如 s1、s3），每条 item 至少一个。
                6. 不得虚构原文中不存在的事实、数字、人名；不确定就少拆，不要凑数。
                7. 一次最多输出 30 条 items；超长原文按重要性合并同类事项，而不是丢弃信息后编造。
                8. summary 用一到三句话概述本期工作；tomorrowPlan 仅当原文含明确后续计划才输出，否则空数组。
                """;
    }

    /**
     * 用户层提示：可信上下文 + 编号转义后的数据。
     * @param segments 编号段落
     * @param today 业务时区今天（服务端注入，模型不允许自己猜日期）
     * @param categoryWhitelist 分类 key→显示名（当前用户岗位模板词表）
     * @param existingTitles 近 7 天既有条目标题（去重合并提示，避免重复记同一件事）
     */
    public String userPrompt(Map<String, String> segments, String today,
                             Map<String, String> categoryWhitelist, List<String> existingTitles) {
        StringBuilder categories = new StringBuilder();
        categoryWhitelist.forEach((key, label) ->
                categories.append("- ").append(key).append("（").append(label).append("）\n"));
        StringBuilder context = new StringBuilder();
        context.append("[可信上下文]\n");
        context.append("今天日期：").append(today).append("（时区 Asia/Shanghai）\n");
        context.append("分类白名单（category 只能取这些 key）：\n").append(categories);
        if (existingTitles != null && !existingTitles.isEmpty()) {
            context.append("近 7 天既有条目（语义相同的事项不要重复建立，可在 detail 补进展）：\n");
            existingTitles.stream().limit(30).forEach(t -> context.append("- ").append(t).append('\n'));
        }
        context.append("\n[待整理原文（段落已编号，sourceRefs 只能引用这些编号）]\n");
        segments.forEach((ref, sentence) ->
                context.append(ref).append(": ").append(sentence.replace("\n", " ")).append('\n'));
        context.append("\n请按系统规则输出 JSON：{\"items\":[...],\"summary\":\"...\",\"tomorrowPlan\":[...]}");
        return context.toString();
    }

    /** 输出结构校验：任何不合规都整次拒绝（invalid_structure），不应用半份结果。 */
    public void validate(CpmAiModelOutput output, Set<String> validRefs, Set<String> categoryKeys) {
        if (output == null || output.getItems() == null) {
            throw new IllegalArgumentException("missing_items");
        }
        if (output.getItems().isEmpty()) {
            throw new IllegalArgumentException("empty_items");
        }
        if (output.getItems().size() > CpmConstants.AI_ITEMS_MAX) {
            throw new IllegalArgumentException("too_many_items");
        }
        int index = 0;
        for (CpmAiModelOutput.RawItem item : output.getItems()) {
            index++;
            if (item == null || !StringUtils.hasText(item.getTitle())) {
                throw new IllegalArgumentException("item_without_title#" + index);
            }
            if (item.getTitle().trim().length() > TITLE_MAX) {
                throw new IllegalArgumentException("title_too_long#" + index);
            }
            if (item.getCategory() == null || !categoryKeys.contains(item.getCategory().trim())) {
                throw new IllegalArgumentException("category_not_whitelisted#" + index);
            }
            String status = item.getStatus() == null ? "" : item.getStatus().trim();
            if (!STATUSES.contains(status)) {
                throw new IllegalArgumentException("bad_status#" + index);
            }
            if (item.getProgress() != null && (item.getProgress() < 0 || item.getProgress() > 100)) {
                throw new IllegalArgumentException("progress_out_of_range#" + index);
            }
            if ("done".equals(status) && item.getProgress() != null && item.getProgress() != 100) {
                throw new IllegalArgumentException("done_without_full_progress#" + index);
            }
            if (item.getSourceRefs() == null || item.getSourceRefs().isEmpty()) {
                throw new IllegalArgumentException("item_without_source#" + index);
            }
            for (String ref : item.getSourceRefs()) {
                if (!validRefs.contains(ref)) {
                    throw new IllegalArgumentException("unknown_source_ref#" + index + ":" + ref);
                }
            }
        }
    }

    /** 校验通过 → DTO 候选（detail 由后端按 sourceRefs 拼回原文，不由模型复述）。 */
    public List<CpmDto.AiCandidate> toCandidates(CpmAiModelOutput output, Map<String, String> segments) {
        List<CpmDto.AiCandidate> out = new ArrayList<>();
        for (CpmAiModelOutput.RawItem item : output.getItems()) {
            CpmDto.AiCandidate c = new CpmDto.AiCandidate();
            c.setTitle(item.getTitle().trim());
            c.setCategory(item.getCategory().trim());
            c.setStatus(item.getStatus().trim());
            int progress = item.getProgress() == null ? 0 : item.getProgress();
            c.setProgress(CpmConstants.STATUS_DONE.equals(c.getStatus()) ? 100 : progress);
            List<String> refs = new ArrayList<>(item.getSourceRefs());
            refs.sort(java.util.Comparator.comparingInt(s -> Integer.parseInt(s.substring(1))));
            c.setSourceRefs(refs);
            StringBuilder detail = new StringBuilder();
            for (String ref : refs) {
                String sentence = segments.get(ref);
                if (sentence != null) {
                    detail.append(sentence).append(' ');
                }
            }
            String trimmed = detail.toString().trim();
            c.setDetail(trimmed.length() > DETAIL_MAX ? trimmed.substring(0, DETAIL_MAX) : trimmed);
            out.add(c);
        }
        return out;
    }

    public void requireInputWithinLimit(String rawText) {
        if (!StringUtils.hasText(rawText)) {
            throw new BusinessException("原文為空，無內容可整理");
        }
        if (rawText.length() > CpmConstants.AI_INPUT_MAX) {
            throw new BusinessException("原文超過 " + CpmConstants.AI_INPUT_MAX + " 字上限，請分段處理");
        }
    }
}
