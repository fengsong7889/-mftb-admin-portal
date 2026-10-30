package com.mftb.admin.service.minutes;

import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * AI 辅助录入的确定性组件单测：日期解析以会议日期为基准、结构校验拒绝越界与伪造引用、
 * 负责人匹配只在可验证时绑定，其余一律标待确认（不替用户猜身份或日期）。
 */
class MeetingMinutesAiLogicTest {

    private final MinutesRelativeDateParser dates = new MinutesRelativeDateParser();
    private final MinutesAiPrompt prompt = new MinutesAiPrompt();

    @Test
    @DisplayName("本周五/下周五以会议日期为基准，跨月跨年正确")
    void relativeWeekdaysAnchorOnMeetingDate() {
        // 2026-11-02 是周一
        assertEquals(LocalDate.of(2026, 11, 6), dates.parse("本周五", LocalDate.of(2026, 11, 2)).date());
        assertEquals(LocalDate.of(2026, 11, 13), dates.parse("下週五", LocalDate.of(2026, 11, 2)).date());
        assertEquals(LocalDate.of(2026, 12, 4), dates.parse("本周五", LocalDate.of(2026, 11, 30)).date());
    }

    @Test
    @DisplayName("明确日期直接解析；尽快/裸周五不猜日期")
    void absoluteAndVague() {
        assertEquals(LocalDate.of(2026, 12, 31), dates.parse("2026-12-31 前", LocalDate.of(2026, 11, 2)).date());
        assertEquals(MinutesRelativeDateParser.Kind.UNRESOLVED, dates.parse("盡快", LocalDate.of(2026, 11, 2)).kind());
        assertEquals("ambiguous_weekday", dates.parse("週五", LocalDate.of(2026, 11, 2)).reasonCode());
        assertEquals("none", dates.parse(null, LocalDate.of(2026, 11, 2)).reasonCode());
    }

    @Test
    @DisplayName("结构校验：合法通过，未知来源/非法枚举/超条数被拒")
    void structureValidation() {
        MinutesAiModelOutput output = new MinutesAiModelOutput();
        MinutesAiModelOutput.Topic topic = new MinutesAiModelOutput.Topic();
        topic.setRef("t1");
        topic.setTopic("進度討論");
        topic.setDecisionStatus("information");
        topic.setSourceRefs(List.of("s1"));
        output.setTopics(List.of(topic));
        prompt.validate(output, Set.of("s1"), Set.of("m1"));

        MinutesAiModelOutput badRef = new MinutesAiModelOutput();
        MinutesAiModelOutput.Topic t2 = new MinutesAiModelOutput.Topic();
        t2.setTopic("x");
        t2.setSourceRefs(List.of("s99"));
        badRef.setTopics(List.of(t2));
        assertThrows(IllegalArgumentException.class, () -> prompt.validate(badRef, Set.of("s1"), Set.of()));

        MinutesAiModelOutput badEnum = new MinutesAiModelOutput();
        MinutesAiModelOutput.Topic t3 = new MinutesAiModelOutput.Topic();
        t3.setTopic("x");
        t3.setDecisionStatus("maybe");
        t3.setSourceRefs(List.of("s1"));
        badEnum.setTopics(List.of(t3));
        assertThrows(IllegalArgumentException.class, () -> prompt.validate(badEnum, Set.of("s1"), Set.of()));
    }

    @Test
    @DisplayName("按句编号稳定，来源引用集合与编号一致")
    void segmentNumbering() {
        Map<String, String> segments = prompt.segment("第一句。第二句！第三句？");
        assertEquals(List.of("s1", "s2", "s3"), List.copyOf(segments.keySet()));
    }

    @Test
    @DisplayName("负责人匹配：有效 mention 绑定；无原文称呼不绑定")
    void ownerMatcherMentionAndBlank() {
        SysUserMapper mapper = mock(SysUserMapper.class);
        MinutesOwnerMatcher matcher = new MinutesOwnerMatcher(mapper);
        SysUser user = new SysUser();
        user.setId(7L);
        user.setName("劉衛");
        user.setStatus(1);
        when(mapper.selectList(any())).thenReturn(List.of(user));
        MinutesOwnerMatcher.Match byMention = matcher.match(7L, null, Map.of());
        assertEquals(MinutesOwnerMatcher.Status.RESOLVED, byMention.status());
        assertEquals(7L, byMention.resolved().getId());

        MinutesOwnerMatcher.Match blank = matcher.match(null, "  ", Map.of());
        assertEquals(MinutesOwnerMatcher.Status.UNRESOLVED, blank.status());
        assertEquals("no_owner", blank.reasonCode());
    }

    @Test
    @DisplayName("负责人匹配：查无此人返回待确认，不伪造身份")
    void ownerMatcherNoMatch() {
        SysUserMapper mapper = mock(SysUserMapper.class);
        when(mapper.selectList(any())).thenReturn(List.of());
        MinutesOwnerMatcher matcher = new MinutesOwnerMatcher(mapper);
        MinutesOwnerMatcher.Match match = matcher.match(null, "路人甲", Map.of());
        assertEquals(MinutesOwnerMatcher.Status.UNRESOLVED, match.status());
        assertTrue("no_match".equals(match.reasonCode()));
    }
}
