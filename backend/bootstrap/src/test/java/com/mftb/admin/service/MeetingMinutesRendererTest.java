package com.mftb.admin.service;

import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesItem;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.MinutesViewTokenUtil;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 纪要卡片渲染与免登令牌。
 *
 * <p>渲染是"一份纪要在钉钉里长什么样"的唯一出口，因此三条渠道侧硬约束必须由测试钉住：
 * 不用表格语法（钉钉 markdown 不渲染表格）、超长折叠而不是硬截、批次尾注必须存在
 * （否则同日重发被渠道按相同内容去重，用户以为发了其实没发）。
 * 令牌则锁"任何篡改/过期/版本落后都必须返回 null"——区分错误码等于允许人用响应枚举有效令牌。
 */
class MeetingMinutesRendererTest {

    private static final String SECRET = "unit-test-secret";

    private static MeetingMinutes minutes(List<MeetingMinutesContent.Action> actions,
                                          List<MeetingMinutesContent.Item> items) {
        MeetingMinutesContent content = new MeetingMinutesContent();
        content.setItems(new ArrayList<>(items));
        content.setActions(new ArrayList<>(actions));
        MeetingMinutes minutes = new MeetingMinutes();
        minutes.setMinutesNo("MJ202610190001");
        minutes.setBookingNo("MT202610190001");
        minutes.setMeetingTitle("Q4 預算復核");
        minutes.setMeetingTimeText("2026-10-19 10:00–11:00");
        minutes.setRoomText("三號會議室 · A 棟 3F");
        minutes.setOrganizerName("王五");
        minutes.setRecorderName("李四");
        minutes.setRecorderEmpNo("MF00002");
        minutes.setContentJson(JsonUtils.toJson(content));
        return minutes;
    }

    private static MeetingMinutesContent.Item item(String topic, String discussion, String conclusion) {
        MeetingMinutesContent.Item item = new MeetingMinutesContent.Item();
        item.setTopic(topic);
        item.setDiscussion(discussion);
        item.setConclusion(conclusion);
        return item;
    }

    private static MeetingMinutesContent.Action action(String content, String owner, String empNo, String dueDate) {
        MeetingMinutesContent.Action action = new MeetingMinutesContent.Action();
        action.setContent(content);
        action.setOwnerName(owner);
        action.setOwnerEmpNo(empNo);
        action.setDueDate(dueDate);
        return action;
    }


    /** v1.1：事项独立成表，渲染只认 item 行；这里把旧测试的行动项转成行 */
    private static List<MeetingMinutesItem> itemsOf(List<MeetingMinutesContent.Action> actions) {
        List<MeetingMinutesItem> out = new ArrayList<>();
        int seq = 0;
        for (MeetingMinutesContent.Action action : actions) {
            seq++;
            MeetingMinutesItem row = new MeetingMinutesItem();
            row.setKind(MeetingMinutesItem.KIND_ACTION);
            row.setSeq(seq);
            row.setContent(action.getContent());
            row.setOwnerName(action.getOwnerName());
            row.setOwnerEmpNo(action.getOwnerEmpNo());
            row.setDueDate(action.getDueDate() == null ? null : java.time.LocalDate.parse(action.getDueDate()));
            row.setStatus(MeetingMinutesItem.STATUS_PENDING);
            out.add(row);
        }
        return out;
    }

    @Test
    @DisplayName("卡片含会议資訊、议题结论与行动项，行动项以列表而不是表格呈现")
    void rendersEverySection() {
        MeetingMinutes minutes = minutes(
                List.of(action("輸出預算明細表", "張三", "MF00001", "2026-10-31")),
                List.of(item("分攤口徑", "財務主張按營收", "按營收分攤，11 月上線")));
        MeetingMinutesRenderer.Rendered rendered = MeetingMinutesRenderer.render(
                minutes, itemsOf(List.of(action("輸出預算明細表", "張三", "MF00001", "2026-10-31"))),
                List.of(), 1, "2026-10-19 20:00", "李四（MF00002）",
                "https://admin.test/#/meeting-minutes-view?token=x", null);

        String markdown = rendered.markdown();
        assertTrue(markdown.contains("Q4 預算復核"), markdown);
        assertTrue(markdown.contains("MT202610190001"), markdown);
        assertTrue(markdown.contains("分攤口徑"), markdown);
        assertTrue(markdown.contains("按營收分攤"), markdown);
        assertTrue(markdown.contains("結論：**按營收分攤"), "結論要加粗突出：" + markdown);
        assertTrue(markdown.contains("- ⏳ 輸出預算明細表"), "行动项必须是带状态符号的列表行：" + markdown);
        assertTrue(markdown.contains("👤 **張三（MF00001）**"), "负责人要独立加粗凸显：" + markdown);
        assertTrue(markdown.contains("張三（MF00001）"), markdown);
        assertTrue(markdown.contains("2026-10-31"), markdown);
        // 钉钉 markdown 不支持表格语法：出现 |---| 就是渲染成一行乱码
        assertFalse(markdown.contains("|---"), "卡片不得出现表格语法");
        assertFalse(rendered.truncated());
    }

    @Test
    @DisplayName("批次尾注必带批次号与发送时刻：没有它，同日重发会被钉钉按相同内容去重")
    void alwaysAppendsBatchMarker() {
        MeetingMinutes minutes = minutes(List.of(), List.of(item("議題", null, "結論")));
        MeetingMinutesRenderer.Rendered first = MeetingMinutesRenderer.render(
                minutes, List.of(), List.of(), 1, "2026-10-19 20:00", "李四", null, null);
        MeetingMinutesRenderer.Rendered second = MeetingMinutesRenderer.render(
                minutes, List.of(), List.of(), 2, "2026-10-19 20:05", "李四", null, null);

        assertTrue(first.markdown().contains("第 1 次發送"), first.markdown());
        assertTrue(second.markdown().contains("第 2 次發送"), second.markdown());
        // 两份正文必须不同：内容完全相同的两条消息当天会被渠道只投一条
        assertFalse(first.markdown().equals(second.markdown()));
    }

    @Test
    @DisplayName("超过渠道上限时折叠为摘要 + 行动项 + 链接，而不是把正文截断")
    void collapsesLongContentInsteadOfCutting() {
        List<MeetingMinutesContent.Item> items = new ArrayList<>();
        for (int index = 0; index < 12; index++) {
            items.add(item("議題" + index, "長".repeat(400), "論".repeat(200)));
        }
        MeetingMinutes minutes = minutes(
                List.of(action("跟進事項", "張三", "MF00001", "2026-11-02")), items);

        MeetingMinutesRenderer.Rendered rendered = MeetingMinutesRenderer.render(
                minutes, itemsOf(List.of(action("跟進事項", "張三", "MF00001", "2026-11-02"))),
                List.of(), 3, "2026-10-19 20:00", "李四",
                "https://admin.test/#/meeting-minutes-view?token=x", null);

        assertTrue(rendered.truncated(), "超长必须标记为折叠");
        assertTrue(rendered.fullLength() > MeetingConstants.MINUTES_MARKDOWN_MAX_CHARS);
        assertTrue(rendered.markdown().length() <= MeetingConstants.MINUTES_MARKDOWN_MAX_CHARS,
                "折叠版仍要能进渠道：" + rendered.markdown().length());
        assertTrue(rendered.markdown().contains("查看完整紀要"), rendered.markdown());
        assertTrue(rendered.markdown().contains("跟進事項"), "行动项最短也要留：" + rendered.markdown());
    }

    @Test
    @DisplayName("没配站点地址时不附链接，也不因此渲染失败")
    void rendersWithoutLink() {
        MeetingMinutes minutes = minutes(List.of(), List.of(item("議題", null, "結論")));
        MeetingMinutesRenderer.Rendered rendered = MeetingMinutesRenderer.render(
                minutes, List.of(), List.of(), 1, "2026-10-19 20:00", "李四", null, null);
        assertFalse(rendered.markdown().contains("查看完整紀要"), rendered.markdown());
        assertTrue(rendered.markdown().contains("第 1 次發送"));
    }

    @Test
    @DisplayName("令牌往返：签名、批次与版本都要对得上")
    void tokenRoundTrip() {
        LocalDateTime expireAt = LocalDateTime.now().plusDays(30);
        String token = MinutesViewTokenUtil.generate(11L, 22L, 3, expireAt, SECRET);
        MinutesViewTokenUtil.Token parsed = MinutesViewTokenUtil.parse(token, SECRET);
        assertNotNull(parsed);
        assertEquals(11L, parsed.minutesId());
        assertEquals(22L, parsed.sendId());
        assertEquals(3, parsed.tokenVersion());
    }

    @Test
    @DisplayName("篡改任一段、换密钥、过期都返回 null，不给可枚举的差异")
    void rejectsTamperedTokens() {
        String token = MinutesViewTokenUtil.generate(11L, 22L, 1, LocalDateTime.now().plusDays(1), SECRET);
        assertNull(MinutesViewTokenUtil.parse(token, "other-secret"));
        String[] parts = token.split("\\.");
        parts[1] = String.valueOf(Long.parseLong(parts[1]) + 1);
        assertNull(MinutesViewTokenUtil.parse(String.join(".", parts), SECRET));
        assertNull(MinutesViewTokenUtil.parse(token.substring(0, token.length() - 3), SECRET));
        assertNull(MinutesViewTokenUtil.parse("not-a-token", SECRET));
        assertNull(MinutesViewTokenUtil.parse(
                MinutesViewTokenUtil.generate(1L, 1L, 0, LocalDateTime.now().minusSeconds(1), SECRET), SECRET));
    }
}
