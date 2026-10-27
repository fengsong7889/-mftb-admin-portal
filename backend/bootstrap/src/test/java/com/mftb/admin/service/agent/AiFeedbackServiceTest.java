package com.mftb.admin.service.agent;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AiFeedback;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AiFeedbackMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 回答反馈：赞/踩只能取值 ±1，同一用户同一条消息重复提交只更新不新增。
 *
 * <p>重复提交若插成两条，低分看板会把一次「改主意」算成两次不满，指标失真。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiFeedbackServiceTest {

    @Mock private AiFeedbackMapper feedbackMapper;
    @Mock private com.mftb.admin.mapper.AiCapabilityMapper capabilityMapper;
    @Mock private OperatorResolver operatorResolver;

    private AiFeedbackService service;

    @BeforeEach
    void setUp() {
        service = new AiFeedbackService(feedbackMapper, capabilityMapper, operatorResolver);
        SysUser user = new SysUser();
        user.setId(9L);
        when(operatorResolver.currentUser()).thenReturn(user);
    }

    private static AiFeedback input(String messageId, int rating) {
        AiFeedback row = new AiFeedback();
        row.setMessageId(messageId);
        row.setRating(rating);
        return row;
    }

    @Test
    @DisplayName("首次反馈落库并绑定当前用户")
    void submitCreatesNewFeedback() {
        when(feedbackMapper.selectOne(any())).thenReturn(null);

        AiFeedback saved = service.submit(input("m-1", 1));

        ArgumentCaptor<AiFeedback> cap = ArgumentCaptor.forClass(AiFeedback.class);
        verify(feedbackMapper).insert(cap.capture());
        assertEquals(9L, cap.getValue().getUserId());
        assertEquals(1, saved.getRating());
    }

    @Test
    @DisplayName("同一条消息改评分只更新原记录")
    void submitUpdatesExistingFeedback() {
        AiFeedback existing = input("m-2", 1);
        existing.setId(3L);
        existing.setUserId(9L);
        when(feedbackMapper.selectOne(any())).thenReturn(existing);

        AiFeedback update = input("m-2", -1);
        update.setReason("  數據不對  ");
        AiFeedback saved = service.submit(update);

        assertEquals(-1, saved.getRating());
        assertEquals("數據不對", saved.getReason());
        verify(feedbackMapper).updateById(existing);
        verify(feedbackMapper, never()).insert(any(AiFeedback.class));
    }

    @Test
    @DisplayName("评分只允许赞(1)/踩(-1)")
    void rejectsInvalidRating() {
        assertThrows(BusinessException.class, () -> service.submit(input("m-3", 0)));
        AiFeedback missing = new AiFeedback();
        missing.setMessageId("m-4");
        assertThrows(BusinessException.class, () -> service.submit(missing));
        verify(feedbackMapper, never()).insert(any(AiFeedback.class));
    }

    @Test
    @DisplayName("缺少消息标识时必须拒绝，避免脏数据无法回溯")
    void rejectsMissingMessageId() {
        BusinessException e = assertThrows(BusinessException.class, () -> service.submit(input(" ", -1)));
        assertTrue(e.getMessage().contains("缺少消息標識"), e.getMessage());
    }

    @Test
    @DisplayName("超长原因截断到 64 字，避免撑爆看板列宽")
    void truncatesLongReason() {
        when(feedbackMapper.selectOne(any())).thenReturn(null);
        AiFeedback row = input("m-5", -1);
        row.setReason("很".repeat(100));

        service.submit(row);

        ArgumentCaptor<AiFeedback> cap = ArgumentCaptor.forClass(AiFeedback.class);
        verify(feedbackMapper).insert(cap.capture());
        String reason = cap.getValue().getReason();
        assertEquals(65, reason.length());
        assertTrue(reason.endsWith("…"));
    }

    @Test
    @DisplayName("低分聚合按工具与原因统计，并给出差评率")
    void aggregatesStats() {
        AiFeedback up = input("m-1", 1);
        up.setCreatedAt(LocalDateTime.of(2026, 10, 20, 10, 0));
        AiFeedback down = input("m-2", -1);
        down.setCreatedAt(LocalDateTime.of(2026, 10, 20, 11, 0));
        down.setToolKeys("rdm_list_projects,rdm_stats_overview");
        down.setReason("數據不對");
        AiFeedback down2 = input("m-3", -1);
        down2.setCreatedAt(LocalDateTime.of(2026, 10, 21, 9, 0));
        down2.setToolKeys("rdm_list_projects");
        down2.setReason("數據不對");
        when(feedbackMapper.selectList(any())).thenReturn(List.of(up, down, down2));

        Map<String, Object> stats = service.stats(30);

        assertEquals(3L, stats.get("total"));
        assertEquals(1L, stats.get("up"));
        assertEquals(2L, stats.get("down"));
        assertEquals(66.7d, (double) stats.get("downRate"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> byTool = (List<Map<String, Object>>) stats.get("byTool");
        assertEquals("rdm_list_projects", byTool.get(0).get("toolKey"));
        assertEquals(2, byTool.get(0).get("count"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> reasons = (List<Map<String, Object>>) stats.get("topReasons");
        assertEquals("數據不對", reasons.get(0).get("reason"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> daily = (List<Map<String, Object>>) stats.get("daily");
        assertEquals(2, daily.size());
    }
}
