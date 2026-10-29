package com.mftb.admin.dto;

import com.mftb.admin.common.BusinessException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
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

    private static MeetingMinutesContent publication() {
        MeetingMinutesContent content = withItem("預算", "保持既有口徑");
        content.setSchemaVersion(MeetingMinutesContent.DOCUMENT_SCHEMA);
        content.setSummary("本次確認預算口徑與交付安排");
        content.setChairUserId(1L);
        content.getItems().get(0).setTopicKey("topic-a");
        content.getItems().get(0).setDecisionStatus(MeetingMinutesContent.DECISION_DECIDED);
        return content;
    }

    @Test
    void draftMayBeIncompleteButPublicationMustHavePurposeOrLegacySummaryAndChair() {
        MeetingMinutesContent content = publication();
        content.setSummary(null);
        content.setChairUserId(null);
        assertDoesNotThrow(content::validate);
        assertThrows(BusinessException.class, content::validateForPublication);
        content.setSummary("確認交付安排");
        assertThrows(BusinessException.class, content::validateForPublication);
        content.setChairUserId(1L);
        assertDoesNotThrow(content::validateForPublication);
        assertEquals("確認交付安排", content.digest());
    }

    @Test
    void purposeOnlyPublicationDoesNotRequireADuplicateSummary() {
        MeetingMinutesContent content = publication();
        content.setSummary(null);
        content.setPurpose("確定本次會議的交付目標");
        assertDoesNotThrow(content::validateForPublication);
        assertEquals("確定本次會議的交付目標", content.digest());
        assertEquals(null, content.getSummary());
        content.setPurpose("  ");
        assertEquals("發布前請填寫會議目的", assertThrows(BusinessException.class, content::validateForPublication).getMessage());
    }

    @Test
    void purposeCombinesLegacyTextWithoutRewritingOrTruncatingIt() {
        MeetingMinutesContent content = publication();
        String purpose = "目".repeat(500);
        String summary = "摘".repeat(300);
        content.setPurpose(purpose);
        content.setSummary(summary);
        assertDoesNotThrow(content::validateForPublication);
        assertEquals(purpose + "\n\n" + summary, content.purposeText());
        assertEquals(purpose, content.getPurpose());
        assertEquals(summary, content.getSummary());
        assertEquals(300, content.digest().length());
        content.setPurpose(content.purposeText());
        content.setSummary(null);
        assertDoesNotThrow(content::validateForPublication);
        assertEquals(802, content.getPurpose().length());
        content.setPurpose(" 同一段內容 ");
        content.setSummary("同一段內容");
        assertEquals("同一段內容", content.purposeText());
    }

    @Test
    void unifiedPurposeRetainsBoundedLengthIncludingLegacySummary() {
        MeetingMinutesContent content = publication();
        content.setSummary(null);
        content.setPurpose("目".repeat(MeetingMinutesContent.PURPOSE_MAX));
        assertDoesNotThrow(content::validateForPublication);
        content.setPurpose(content.getPurpose() + "目");
        assertThrows(BusinessException.class, content::validate);
        content.setPurpose("目".repeat(MeetingMinutesContent.PURPOSE_MAX));
        content.setSummary("舊摘要");
        assertThrows(BusinessException.class, content::validate);
    }

    @Test
    void everyPublishedActionAndFollowUpNeedsAnOwnerAndDeadline() {
        MeetingMinutesContent content = publication();
        content.setActions(List.of(action("提交報表", null, null)));
        assertDoesNotThrow(content::validate);
        assertThrows(BusinessException.class, content::validateForPublication);
        content.getActions().get(0).setOwnerUserId(2L);
        assertThrows(BusinessException.class, content::validateForPublication);
        content.getActions().get(0).setDueDate("2026-11-01");
        assertDoesNotThrow(content::validateForPublication);
        MeetingMinutesContent.OpenIssue follow = new MeetingMinutesContent.OpenIssue();
        follow.setContent("確認預算池");
        content.setOpenIssues(List.of(follow));
        assertThrows(BusinessException.class, content::validateForPublication);
        follow.setOwnerUserId(3L);
        follow.setDueDate("2026-11-02");
        assertDoesNotThrow(content::validateForPublication);
    }

    @Test
    void decisionsCannotBeInventedFromAnEmptyConclusion() {
        MeetingMinutesContent content = publication();
        MeetingMinutesContent.Item topic = content.getItems().get(0);
        topic.setDecisionStatus(null);
        assertThrows(BusinessException.class, content::validateForPublication);
        topic.setDecisionStatus(MeetingMinutesContent.DECISION_PENDING);
        topic.setConclusion(null);
        assertThrows(BusinessException.class, content::validateForPublication);
        topic.setConclusion("待財務確認成本口徑");
        assertDoesNotThrow(content::validateForPublication);
        topic.setDecisionStatus(MeetingMinutesContent.DECISION_INFORMATION);
        topic.setConclusion(null);
        assertThrows(BusinessException.class, content::validateForPublication);
        topic.setDiscussion("同步現有執行進度");
        assertDoesNotThrow(content::validateForPublication);
    }

    @Test
    void taskIdentityCannotBeDuplicatedOrLinkedToAnUnknownTopic() {
        MeetingMinutesContent content = publication();
        MeetingMinutesContent.Action action = action("提交報表", 2L, "2026-11-01");
        action.setItemId(31L);
        action.setTopicKey("topic-missing");
        content.setActions(List.of(action));
        assertThrows(BusinessException.class, content::validate);
        action.setTopicKey("topic-a");
        assertDoesNotThrow(content::validate);
        MeetingMinutesContent.OpenIssue follow = new MeetingMinutesContent.OpenIssue();
        follow.setContent("跟進資料");
        follow.setItemId(31L);
        content.setOpenIssues(List.of(follow));
        assertThrows(BusinessException.class, content::validate);
        follow.setItemId(-1L);
        assertThrows(BusinessException.class, content::validate);
    }

    @Test
    void attendanceRejectsConflictingStatesAndUnknownEnums() {
        MeetingMinutesContent content = publication();
        MeetingMinutesContent.Attendance present = new MeetingMinutesContent.Attendance();
        present.setUserId(2L);
        present.setStatus(MeetingMinutesContent.ATTENDANCE_PRESENT);
        MeetingMinutesContent.Attendance absent = new MeetingMinutesContent.Attendance();
        absent.setUserId(2L);
        absent.setStatus(MeetingMinutesContent.ATTENDANCE_ABSENT);
        content.setAttendance(List.of(present, absent));
        assertThrows(BusinessException.class, content::validate);
        content.setAttendance(List.of(present));
        present.setStatus("unknown");
        assertThrows(BusinessException.class, content::validate);
        present.setStatus(MeetingMinutesContent.ATTENDANCE_UNVERIFIED);
        assertDoesNotThrow(content::validate);
        content.setSchemaVersion(99);
        assertThrows(BusinessException.class, content::validate);
    }

    @Test
    void impossibleCalendarDatesAndTimesAreRejected() {
        MeetingMinutesContent content = publication();
        content.setActions(List.of(action("事項", 2L, "2026-02-30")));
        assertThrows(BusinessException.class, content::validate);
        content.getActions().get(0).setDueDate("2028-02-29");
        assertDoesNotThrow(content::validate);
        content.setNextMeetingAt("2026-11-02 25:00");
        assertThrows(BusinessException.class, content::validate);
    }

    @Test
    void newFieldsRespectTheirLimitsAndParticipateInTotalLength() {
        MeetingMinutesContent content = publication();
        content.setPurpose("目".repeat(MeetingMinutesContent.PURPOSE_MAX + 1));
        assertThrows(BusinessException.class, content::validate);
        content.setPurpose("會議目的");
        content.setSummary("摘".repeat(MeetingMinutesContent.SUMMARY_MAX + 1));
        assertThrows(BusinessException.class, content::validate);
        content.setSummary("摘要");
        int before = content.contentLength();
        MeetingMinutesContent.Action action = action("事項", 2L, "2026-11-02");
        action.setDeliverable("验收".repeat(150));
        content.setActions(List.of(action));
        assertEquals(before + 2 + 300, content.contentLength());
        action.setDeliverable("驗".repeat(MeetingMinutesContent.ACTION_MAX + 1));
        assertThrows(BusinessException.class, content::validate);
    }

    @Test
    void nullNestedElementsReturnBusinessErrorsInsteadOfServerErrors() {
        MeetingMinutesContent content = publication();
        content.setActions(java.util.Arrays.asList((MeetingMinutesContent.Action) null));
        assertThrows(BusinessException.class, content::validate);
        content.setActions(List.of());
        content.setAttendance(java.util.Arrays.asList((MeetingMinutesContent.Attendance) null));
        assertThrows(BusinessException.class, content::validate);
    }

    @Test
    @DisplayName("附件字段：条数上限、号形态与去重在服务端拦住；存在性/归属另由服务层回查")
    void attachmentNumbersAreShapeCheckedHere() {
        MeetingMinutesContent content = publication();
        content.setAttachments(List.of("a".repeat(32)));
        assertDoesNotThrow(content::validate);
        content.setAttachments(List.of("a".repeat(32), "b".repeat(32), "c".repeat(32), "d".repeat(32), "e".repeat(32), "f".repeat(32)));
        assertThrows(BusinessException.class, content::validate);
        content.setAttachments(List.of("not-a-hex-no"));
        assertThrows(BusinessException.class, content::validate);
        content.setAttachments(List.of("A".repeat(32)));
        assertThrows(BusinessException.class, content::validate);
        content.setAttachments(List.of("a".repeat(32), "a".repeat(32)));
        assertThrows(BusinessException.class, content::validate);
        content.setAttachments(List.of());
        assertDoesNotThrow(content::validate);
        content.setAttachments(null);
        assertDoesNotThrow(content::validate);
    }
}
