package com.mftb.admin.dto;

import com.mftb.admin.common.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 纪要模板正文的服务端校验。
 *
 * <p>钉住的是"写进去就会造成事实性错误"的判断：空纪要被发出、议题没有标题、
 * 行动项时限写成前端自创的格式、正文长到塞进 TEXT 列。这些都只在前端拦的话，
 * 一次接口直连就能写进不可读的数据。
 */
class MeetingMinutesContentTest {

    private static MeetingMinutesContent withItem(String topic, String conclusion) {
        MeetingMinutesContent content = new MeetingMinutesContent();
        MeetingMinutesContent.Item item = new MeetingMinutesContent.Item();
        item.setTopic(topic);
        item.setConclusion(conclusion);
        content.setItems(new ArrayList<>(List.of(item)));
        return content;
    }

    private static MeetingMinutesContent.Action action(String content, Long ownerUserId, String dueDate) {
        MeetingMinutesContent.Action action = new MeetingMinutesContent.Action();
        action.setContent(content);
        action.setOwnerUserId(ownerUserId);
        action.setDueDate(dueDate);
        return action;
    }

    @Test
    @DisplayName("议题与行动项全空时拒绝：空纪要发出去只会让收件人以为会议没结论")
    void rejectsEmptyMinutes() {
        MeetingMinutesContent content = new MeetingMinutesContent();
        content.setItems(List.of());
        content.setActions(List.of());
        BusinessException error = assertThrows(BusinessException.class, content::validate);
        assertTrue(error.getMessage().contains("議題"), error.getMessage());
    }

    @Test
    @DisplayName("只有行动项、没有议题时允许通过（很多工作会确实只留下待办）")
    void allowsActionOnlyMinutes() {
        MeetingMinutesContent content = new MeetingMinutesContent();
        content.setItems(List.of());
        content.setActions(new ArrayList<>(List.of(action("輸出預算明細", 7L, "2026-10-31"))));
        content.validate();
    }

    @Test
    @DisplayName("议题缺标题即拒绝：没有标题的议题在钉钉卡片里是一行空白")
    void rejectsItemWithoutTopic() {
        MeetingMinutesContent content = withItem("  ", "結論已有");
        BusinessException error = assertThrows(BusinessException.class, content::validate);
        assertTrue(error.getMessage().contains("標題"), error.getMessage());
    }

    @Test
    @DisplayName("长度上限按字段生效，而不是整体截断")
    void enforcesPerFieldLimits() {
        MeetingMinutesContent longTopic = withItem("題".repeat(MeetingMinutesContent.TOPIC_MAX + 1), null);
        assertThrows(BusinessException.class, longTopic::validate);

        MeetingMinutesContent longDiscussion = withItem("預算", null);
        longDiscussion.getItems().get(0).setDiscussion("數".repeat(MeetingMinutesContent.TEXT_MAX + 1));
        assertThrows(BusinessException.class, longDiscussion::validate);
    }

    @Test
    @DisplayName("日期只接受约定格式：前端传什么格式都写进正文的话，重开页面就解析不出来")
    void enforcesDateFormat() {
        // 带时间部分与斜杠写法都是前端可能传回来的形态：存进去就等于一个解析不出来的日期
        MeetingMinutesContent withTime = new MeetingMinutesContent();
        withTime.setItems(List.of());
        withTime.setActions(new ArrayList<>(List.of(action("事項", 7L, "2026-10-31 10:00"))));
        assertThrows(BusinessException.class, withTime::validate);

        MeetingMinutesContent withSlash = new MeetingMinutesContent();
        withSlash.setItems(List.of());
        // 斜杠与英文月份都是前端日期控件可能的输出形态，存进去就再也比较不了
        withSlash.setActions(new ArrayList<>(List.of(action("事項", 7L, "31/10/2026"))));
        assertThrows(BusinessException.class, withSlash::validate);

        MeetingMinutesContent ok = new MeetingMinutesContent();
        ok.setItems(List.of());
        ok.setActions(new ArrayList<>(List.of(action("事項", 7L, "2026-10-31"))));
        ok.validate();
    }

    @Test
    @DisplayName("正文总字数超上限时拒绝（列是 TEXT，但卡片与解析都要可控长度）")
    void enforcesTotalLength() {
        MeetingMinutesContent content = new MeetingMinutesContent();
        MeetingMinutesContent.Item item = new MeetingMinutesContent.Item();
        item.setTopic("題");
        item.setDiscussion("長".repeat(MeetingMinutesContent.TEXT_MAX));
        item.setConclusion("論".repeat(MeetingMinutesContent.TEXT_MAX));
        List<MeetingMinutesContent.Item> items = new ArrayList<>();
        for (int index = 0; index < MeetingMinutesContent.MAX_ITEMS; index++) {
            items.add(item);
        }
        content.setItems(items);
        BusinessException error = assertThrows(BusinessException.class, content::validate);
        assertTrue(error.getMessage().contains("上限"), error.getMessage());
    }

    @Test
    @DisplayName("议题条数与缺席人数有上限：超出说明输入错，而不是让表继续长")
    void enforcesCollectionSizes() {
        MeetingMinutesContent content = withItem("題", "論");
        List<MeetingMinutesContent.Item> items = new ArrayList<>();
        for (int index = 0; index <= MeetingMinutesContent.MAX_ITEMS; index++) {
            items.add(content.getItems().get(0));
        }
        content.setItems(items);
        assertThrows(BusinessException.class, content::validate);
    }

    @Test
    @DisplayName("摘要优先取结论；没有结论退回首条议题，再没有退到首条行动项")
    void digestFallsBackInOrder() {
        assertEquals("上線時間定 11 月", withItem("預算", "上線時間定 11 月").digest());
        assertEquals("預算", withItem("預算", null).digest());

        MeetingMinutesContent onlyAction = new MeetingMinutesContent();
        onlyAction.setItems(List.of());
        onlyAction.setActions(new ArrayList<>(List.of(action("補齊明細", 7L, null))));
        assertEquals("補齊明細", onlyAction.digest());
    }

    @Test
    @DisplayName("摘要不超过 300 字：列表列宽与卡片都按这个长度排版")
    void digestIsTruncated() {
        String digest = withItem("題", "論".repeat(400)).digest();
        assertEquals(300, digest.length());
    }
}
