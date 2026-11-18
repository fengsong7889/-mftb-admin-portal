/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.dto.CpmDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * AI 输出白名单校验钉死：模型输出是不可信输入。
 * 任何一条「宽松通过」的回归都可能把幻觉分类、伪造进度或跑飞的条数直接写进员工记录。
 */
class CpmAiPromptTest {

    private final CpmAiPrompt prompt = new CpmAiPrompt();
    private final Map<String, String> whitelist = Map.of("develop", "開發", "prd_review", "需求評審");

    private static CpmAiModelOutput.RawItem raw(String title, String category, String status, Integer progress,
                                                   List<String> refs) {
        CpmAiModelOutput.RawItem item = new CpmAiModelOutput.RawItem();
        item.setTitle(title);
        item.setCategory(category);
        item.setStatus(status);
        item.setProgress(progress);
        item.setSourceRefs(refs);
        return item;
    }

    private static CpmAiModelOutput output(List<CpmAiModelOutput.RawItem> items) {
        CpmAiModelOutput out = new CpmAiModelOutput();
        out.setItems(items);
        return out;
    }

    @Test
    @DisplayName("分句编号：预览可回溯，sourceRefs 只能引用真实段落")
    void segmentsAreNumbered() {
        Map<String, String> segments = prompt.segment("上午完成XX接口。下午聯調XX頁面！\n待辦：明天評審YY需求");
        assertTrue(segments.containsKey("s1") && segments.containsKey("s2") && segments.containsKey("s3"));
        assertThrows(IllegalArgumentException.class, () -> prompt.validate(
                output(List.of(raw("合法事項", "develop", "doing", 50, List.of("s99")))),
                segments.keySet(), whitelist.keySet()));
    }

    @Test
    @DisplayName("分类不在岗位词表白名单：直接拒绝（幻觉分类不得入库）")
    void rejectsUnknownCategory() {
        Map<String, String> segments = prompt.segment("任何原文");
        assertThrows(IllegalArgumentException.class, () -> prompt.validate(
                output(List.of(raw("事項", "hr_policy", "done", 100, List.of("s1")))),
                segments.keySet(), whitelist.keySet()));
    }

    @Test
    @DisplayName("progress 越界 / done 非 100 / 未知 status / 超 30 条 / 空 items 全部拒绝")
    void rejectsBadShapes() {
        Set<String> refs = Set.of("s1");
        assertThrows(IllegalArgumentException.class, () -> prompt.validate(
                output(List.of(raw("A", "develop", "doing", 101, List.of("s1")))), refs, whitelist.keySet()));
        assertThrows(IllegalArgumentException.class, () -> prompt.validate(
                output(List.of(raw("A", "develop", "done", 80, List.of("s1")))), refs, whitelist.keySet()));
        assertThrows(IllegalArgumentException.class, () -> prompt.validate(
                output(List.of(raw("A", "develop", "archived", 50, List.of("s1")))), refs, whitelist.keySet()));
        assertThrows(IllegalArgumentException.class, () -> prompt.validate(
                output(List.of()), refs, whitelist.keySet()));
        java.util.List<CpmAiModelOutput.RawItem> tooMany = new java.util.ArrayList<>();
        for (int i = 0; i < 31; i++) {
            tooMany.add(raw("事項" + i, "develop", "doing", 10, List.of("s1")));
        }
        assertThrows(IllegalArgumentException.class,
                () -> prompt.validate(output(tooMany), refs, whitelist.keySet()));
    }

    @Test
    @DisplayName("合法输出转候选：detail 由后端按 sourceRefs 拼回原文，不信模型复述")
    void buildsCandidatesFromSourceText() {
        Map<String, String> segments = Map.of(
                "s1", "上午完成商家權重接口開發。",
                "s2", "下午與前端聯調通過。");
        CpmAiModelOutput out = output(List.of(raw("商家權重接口", "develop", "done", 100, List.of("s1", "s2"))));
        prompt.validate(out, segments.keySet(), whitelist.keySet());
        List<CpmDto.AiCandidate> candidates = prompt.toCandidates(out, segments);
        assertEquals(1, candidates.size());
        assertEquals(100, candidates.get(0).getProgress());
        assertTrue(candidates.get(0).getDetail().contains("商家權重接口開發"), "detail 必须是原文拼接");
        assertEquals(List.of("s1", "s2"), candidates.get(0).getSourceRefs());
    }
}
