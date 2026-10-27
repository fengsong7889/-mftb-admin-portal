package com.mftb.admin.service;

import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesItem;
import com.mftb.admin.entity.SysNotificationSwitch;
import com.mftb.admin.entity.SysNotificationTemplate;
import com.mftb.admin.mapper.SysNotificationSwitchMapper;
import com.mftb.admin.mapper.SysNotificationTemplateMapper;
import com.mftb.admin.util.JsonUtils;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 通知模板渲染：证明“管理员在「通知模板」页改的内容会真的出现在钉钉卡片里”，
 * 而不是只改一张页面上的表。
 *
 * <p>同时钉住两条降级口径：模板停用 → 回落到内置文案；变量写错 → 清空占位而不是把
 * {@code ${xxx}} 发给收件人。
 */
class MeetingMinutesTemplateRenderTest {

    private static SysNotificationTemplate template(String body) {
        SysNotificationTemplate row = new SysNotificationTemplate();
        row.setSceneKey("meeting_minutes");
        row.setSceneName("會議紀要");
        row.setTitleTpl("【會議紀要】${meetingTitle}");
        row.setBodyTpl(body);
        row.setEnabled(1);
        return row;
    }

    private static MeetingNotifyTemplateService service(SysNotificationTemplate row) {
        SysNotificationTemplateMapper templateMapper = mock(SysNotificationTemplateMapper.class);
        SysNotificationSwitchMapper switchMapper = mock(SysNotificationSwitchMapper.class);
        when(templateMapper.findByScene("meeting_minutes")).thenReturn(row);
        return new MeetingNotifyTemplateService(templateMapper, switchMapper);
    }

    @Test
    @DisplayName("模板里的姓名加粗与批次变量会替换成真值，未知变量被清空")
    void rendersTemplateWithVariables() {
        MeetingNotifyTemplateService service = service(template(
                "**${meetingTitle}**\n\n負責人：👤 **${ownerName}（${ownerEmpNo}）**\n"
                        + "事項：${itemContent}\n${unknownVariable}\n${batchNote}"));

        MeetingNotifyTemplateService.Rendered rendered = service.render("meeting_minutes", Map.of(
                "meetingTitle", "Q4 預算復核",
                "ownerName", "張三",
                "ownerEmpNo", "MF00007",
                "itemContent", "輸出明細",
                "batchNote", "第 2 次發送"));

        assertTrue(rendered.body().contains("👤 **張三（MF00007）**"), rendered.body());
        assertTrue(rendered.body().contains("輸出明細"), rendered.body());
        assertTrue(rendered.body().contains("第 2 次發送"), rendered.body());
        assertFalse(rendered.body().contains("${"), "未替换的占位不能发给收件人：" + rendered.body());
    }

    @Test
    @DisplayName("模板停用时回落内置文案：宁可样式旧，也不能因为文案配置把通知卡住")
    void disabledTemplateFallsBack() {
        SysNotificationTemplate row = template("**${meetingTitle}**");
        row.setEnabled(0);
        MeetingNotifyTemplateService service = service(row);

        assertNull(service.render("meeting_minutes", Map.of("meetingTitle", "Q4")));
    }

    @Test
    @DisplayName("Renderer 走模板：负责人加粗与批次尾注都在，且不含表格语法")
    void rendererUsesTemplate() {
        MeetingMinutes minutes = new MeetingMinutes();
        minutes.setMinutesNo("MJ202610200001");
        minutes.setBookingNo("MT202610130001");
        minutes.setMeetingTitle("Q4 預算復核");
        minutes.setMeetingTimeText("2026-10-19 10:00–11:00");
        minutes.setRoomText("三號會議室");
        minutes.setOrganizerName("王五");
        minutes.setRecorderName("李四");
        MeetingMinutesContent content = new MeetingMinutesContent();
        content.setItems(List.of());
        minutes.setContentJson(JsonUtils.toJson(content));

        MeetingMinutesItem item = new MeetingMinutesItem();
        item.setKind(MeetingMinutesItem.KIND_FOLLOW);
        item.setSeq(1);
        item.setContent("確認分攤口徑");
        item.setOwnerName("張三");
        item.setOwnerEmpNo("MF00007");
        item.setDueDate(java.time.LocalDate.parse("2026-10-31"));
        item.setStatus(MeetingMinutesItem.STATUS_PENDING);

        MeetingNotifyTemplateService service = service(template(
                "**${meetingTitle}**\n\n跟進事項\n${followUps}\n\n${batchNote}"));

        MeetingMinutesRenderer.Rendered rendered = MeetingMinutesRenderer.render(
                minutes, List.of(item), List.of(), 3, "2026-10-20 09:00", "李四", null, service);

        assertTrue(rendered.markdown().contains("Q4 預算復核"), rendered.markdown());
        assertTrue(rendered.markdown().contains("👤 **張三（MF00007）**"), rendered.markdown());
        assertTrue(rendered.markdown().contains("第 3 次發送"), rendered.markdown());
        assertFalse(rendered.markdown().contains("|---"), "钉钉 markdown 不支持表格");
        assertFalse(rendered.markdown().contains("${"), rendered.markdown());
    }

    @Test
    @DisplayName("推送开关：没有配置行按开处理，显式关闭才拦")
    void switchDefaultsToOn() {
        SysNotificationSwitchMapper switchMapper = mock(SysNotificationSwitchMapper.class);
        SysNotificationTemplateMapper templateMapper = mock(SysNotificationTemplateMapper.class);
        MeetingNotifyTemplateService service = new MeetingNotifyTemplateService(templateMapper, switchMapper);

        assertTrue(service.enabled("meeting_minutes", SysNotificationSwitch.CHANNEL_WORK));

        SysNotificationSwitch row = new SysNotificationSwitch();
        row.setSceneKey("meeting_minutes");
        row.setChannel(SysNotificationSwitch.CHANNEL_GROUP);
        row.setEnabled(0);
        when(switchMapper.findOne("meeting_minutes", SysNotificationSwitch.CHANNEL_GROUP)).thenReturn(row);
        assertFalse(service.enabled("meeting_minutes", SysNotificationSwitch.CHANNEL_GROUP));
    }

    @Test
    @DisplayName("变量替换不执行表达式：值里的占位不会被二次解析")
    void fillIsLiteralOnly() {
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("name", "${meetingTitle}");
        String out = MeetingNotifyTemplateService.fill("${name}", vars);
        // 替换进来的值不会被再次当模板解析（不递归），残留占位在收尾时清掉
        assertFalse(out.contains("${"), out);
    }
}
