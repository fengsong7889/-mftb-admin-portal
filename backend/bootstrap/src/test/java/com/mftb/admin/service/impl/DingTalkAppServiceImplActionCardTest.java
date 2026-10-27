package com.mftb.admin.service.impl;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 会议卡片的圆角按钮协议单测（不依赖网络/钉钉）。
 *
 * <p>钉钉工作通知有两种 ActionCard：
 * <ul>
 *   <li>整体跳转：{@code single_title/single_url}，移动端渲染为一行带箭头的文字；</li>
 *   <li>独立跳转：{@code btn_json_list + btn_orientation}，渲染为圆角按钮。</li>
 * </ul>
 * 本用例钉住会议走后者，避免后续把按钮改回“文字链接”样式。
 */
class DingTalkAppServiceImplActionCardTest {

    @Test
    @DisplayName("会议按钮走独立跳转协议：btn_json_list + 竖直排列，不再出现 single_title")
    @SuppressWarnings("unchecked")
    void pillActionCardUsesBtnJsonList() {
        Map<String, Object> msg = DingTalkAppServiceImpl.buildPillActionCardMessage(
                "產品週會", "**產品週會**\n\n會議時間：**2026-10-27 10:00**",
                "查看會議詳情", "https://portal.example.com/#/meeting-view?token=abc");

        assertEquals("action_card", msg.get("msgtype"));
        Map<String, Object> card = (Map<String, Object>) msg.get("action_card");
        assertEquals("0", card.get("btn_orientation"), "单按钮必须竖直排列，才能占满一行");
        assertFalse(card.containsKey("single_title"), "独立跳转样式不能混入整体跳转字段");
        assertFalse(card.containsKey("single_url"));

        List<Map<String, String>> buttons = (List<Map<String, String>>) card.get("btn_json_list");
        assertEquals(1, buttons.size());
        assertEquals("查看會議詳情", buttons.get(0).get("title"));
        assertEquals("https://portal.example.com/#/meeting-view?token=abc",
                buttons.get(0).get("action_url"));
        assertTrue(card.get("markdown").toString().contains("會議時間"));
    }
}
