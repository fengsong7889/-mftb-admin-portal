package com.mftb.admin.service.impl;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * PRD 富文本验收标准抽取单测。
 * <p>表单精简后富文本是唯一事实源，抽取边界判错会让业务验收检查项漏抽/多抽，
 * 故把 AI 草稿形态（【】标记 + ol）、人工形态（标题 + 段落）、英文标题、无节、空节、实体还原逐一定住。
 */
class RdmPrdCriteriaExtractTest {

    @Test
    @DisplayName("AI 草稿形态：【驗收標準】有序清单节逐条抽出，遇下一个【】标记停止")
    void extractsBracketMarkerOlSection() {
        String html = "<p><b>【功能清單】</b></p><ol><li>導出</li></ol>"
                + "<p><b>【驗收標準】</b></p><ol><li>可選任意起止日期</li><li>導出文件名含區間</li></ol>"
                + "<p><b>【範圍邊界】</b></p><p>不含定時執行</p>";
        assertEquals("可選任意起止日期\n導出文件名含區間",
                RdmDeliveryServiceImpl.extractAcceptanceCriteria(html));
    }

    @Test
    @DisplayName("人工书写形态：h2 标题起节、段落逐条抽出，遇下一个标题停止")
    void extractsHeadingSection() {
        String html = "<h2>驗收標準</h2><p>1. 登錄成功</p><p>2. 失敗提示原因</p><h2>風險與依賴</h2><p>第三方接口</p>";
        assertEquals("1. 登錄成功\n2. 失敗提示原因",
                RdmDeliveryServiceImpl.extractAcceptanceCriteria(html));
    }

    @Test
    @DisplayName("英文标题同样起验收节")
    void extractsEnglishHeading() {
        String html = "<h2>Acceptance Criteria</h2><ul><li>export contains range</li></ul>";
        assertEquals("export contains range", RdmDeliveryServiceImpl.extractAcceptanceCriteria(html));
    }

    @Test
    @DisplayName("无验收节：返回 null 让调用方保留旧结构化值")
    void returnsNullWithoutSection() {
        assertNull(RdmDeliveryServiceImpl.extractAcceptanceCriteria("<p>只是普通段落</p>"));
        assertNull(RdmDeliveryServiceImpl.extractAcceptanceCriteria("舊純文本正文\n驗收標準：可用"));
        assertNull(RdmDeliveryServiceImpl.extractAcceptanceCriteria(null));
    }

    @Test
    @DisplayName("节存在但为空：返回空串而非 null，不把旧值误保留")
    void emptySectionReturnsEmptyString() {
        assertEquals("", RdmDeliveryServiceImpl.extractAcceptanceCriteria(
                "<p><b>【驗收標準】</b></p><p><b>【範圍邊界】</b></p>"));
    }

    @Test
    @DisplayName("实体还原：清单项里的 &lt; 不等价残留转义")
    void unescapesEntities() {
        String html = "<p>【驗收標準】</p><ol><li>區間 &lt;= 90 天</li></ol>";
        assertEquals("區間 <= 90 天", RdmDeliveryServiceImpl.extractAcceptanceCriteria(html));
    }
}
