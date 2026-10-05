package com.mftb.admin.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

/**
 * RDM 相似需求查重测试（M4+）。
 * <p>查重要直接影响「这条需求还要不要再提一遍」，阈值与排除规则必须有测试锁住：
 * 调松一档会误伤（提单被无端拦下），调紧一档就形同虚设。
 */
class RdmSimilarServiceTest {

    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    private final RdmSimilarService service = new RdmSimilarService(jdbcTemplate);

    /** 造一条历史需求（字段与查重 SQL 的查询列一致） */
    private static Map<String, Object> row(long id, String reqNo, String title, String status,
                                           String submitter, String expect) {
        return Map.ofEntries(
                Map.entry("id", id),
                Map.entry("req_no", reqNo),
                Map.entry("title", title),
                Map.entry("status", status),
                Map.entry("req_type", "OPTIMIZE"),
                Map.entry("priority", "P2"),
                Map.entry("submitter_name", submitter),
                Map.entry("submit_dept_name", "商家運營部"),
                Map.entry("assignee_pm_name", "陳雅婷"),
                Map.entry("submit_time", "2026-09-20 10:00:00"),
                Map.entry("expect_result", expect == null ? "" : expect));
    }

    /** 让 jdbcTemplate 返回给定候选行 */
    private void stubRows(List<Map<String, Object>> rows) {
        doReturn(rows).when(jdbcTemplate).queryForList(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("分词：中文取二元组，西文按词切，标点与分隔符丢弃")
    void tokenizeCjkBigramsAndLatinWords() {
        var tokens = RdmSimilarService.tokenize("推薦報表 export_v2, 導出！");
        assertTrue(tokens.contains("推薦"), "应含中文二元组「推薦」");
        assertTrue(tokens.contains("報表"), "应含中文二元组「報表」");
        // 下划线是分隔符：export_v2 切成 export / v2（对相似度而言足够）
        assertTrue(tokens.contains("export"));
        assertTrue(tokens.contains("v2"));
        assertFalse(tokens.contains("！"), "标点不应成为 token");
    }

    @Test
    @DisplayName("Dice 系数：完全相同为 1，无交集为 0")
    void diceBoundary() {
        assertEquals(1.0, RdmSimilarService.dice(
                RdmSimilarService.tokenize("門店列表"), RdmSimilarService.tokenize("門店列表")), 0.0001);
        assertEquals(0.0, RdmSimilarService.dice(
                RdmSimilarService.tokenize("門店列表"), RdmSimilarService.tokenize("完全不相关")), 0.0001);
    }

    @Test
    @DisplayName("同名需求置顶、判为疑似重复，并给出命中词")
    void sameTitleIsDuplicateSuspect() {
        stubRows(List.of(row(9L, "XQ202609200009", "推薦報表支持自定義時間區間導出",
                "uat_pending", "张晓琳", "可自選起止日期")));

        var result = service.findSimilar("推薦報表支持自定義時間區間導出", "希望支持自定義時間區間", null, "张晓琳");

        assertTrue(result.getDuplicateSuspect(), "同名且在途应判疑似重复");
        assertEquals(1.0, result.getItems().get(0).getSimilarity(), 0.0001);
        assertTrue(result.getItems().get(0).getSameSubmitter(), "同提出人应被标出");
        assertTrue(result.getItems().get(0).getInProgress());
        assertFalse(result.getItems().get(0).getMatchedTerms().isEmpty(), "命中词必须可见，不能只给一个黑箱分数");
    }

    @Test
    @DisplayName("终态需求只作参考，不判重复")
    void finishedRequirementIsNotDuplicate() {
        stubRows(List.of(row(8L, "XQ202601010001", "推薦報表支持自定義時間區間導出",
                "released", "王大衛", "可自選起止日期")));

        var result = service.findSimilar("推薦報表支持自定義時間區間導出", null, null, "张晓琳");

        assertFalse(result.getDuplicateSuspect(), "已上线的历史需求不该拦住新需求");
        assertEquals(1, result.getItems().size(), "仍要作为相似参考展示");
        assertFalse(result.getItems().get(0).getInProgress());
    }

    @Test
    @DisplayName("完全不相关时不返回候选，避免提单页噪音")
    void unrelatedTitleReturnsEmpty() {
        stubRows(List.of(row(7L, "XQ202609180007", "門店列表新增停業風險標籤列",
                "developing", "孫小紅", "列表展示風險標籤")));

        var result = service.findSimilar("團購活動庫存同步延遲", null, null, "李娜");

        assertTrue(result.getItems().isEmpty(), "不相关时不应硬凑候选: " + result.getItems());
        assertFalse(result.getDuplicateSuspect());
    }

    @Test
    @DisplayName("标题过短时不查重（两字标题会命中一堆误报）")
    void tooShortTitleSkipped() {
        var result = service.findSimilar("報表", null, null, "张晓琳");
        assertTrue(result.getItems().isEmpty());
        assertFalse(result.getDuplicateSuspect());
    }
}
