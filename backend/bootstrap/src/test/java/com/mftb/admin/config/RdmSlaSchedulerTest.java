package com.mftb.admin.config;

import com.mftb.admin.config.migration.MigrationLock;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmNotifyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 阈值与发送意图测试；Mock 通知服务，不向真实渠道投递。 */
class RdmSlaSchedulerTest {
    private JdbcTemplate jdbc;
    private MigrationLock lock;
    private RdmConfigService config;
    private RdmNotifyService notify;
    private RdmRequirementMapper mapper;
    private RdmSlaScheduler scheduler;
    private RdmRequirement requirement;

    @BeforeEach
    void setup() {
        jdbc = mock(JdbcTemplate.class);
        lock = mock(MigrationLock.class);
        config = mock(RdmConfigService.class);
        notify = mock(RdmNotifyService.class);
        mapper = mock(RdmRequirementMapper.class);
        scheduler = new RdmSlaScheduler(jdbc, lock, config, notify, mapper);
        doAnswer(inv -> { ((Runnable) inv.getArgument(2)).run(); return null; })
                .when(lock).runExclusive(eq("rdm_sla_scan"), eq(0), any());
        requirement = new RdmRequirement();
        requirement.setId(5L);
        when(mapper.selectById(5L)).thenReturn(requirement);
        when(config.slaHours("evaluating", "P1")).thenReturn(24);
        when(config.warnHours("evaluating", "P1")).thenReturn(18);
        when(config.statusLabelMap()).thenReturn(Map.of());
    }

    private void row(int hours, int flagged) {
        when(jdbc.queryForList(anyString())).thenReturn(List.of(Map.of(
                "id", 5L, "req_no", "QA_SLA", "title", "QA SLA",
                "status", "evaluating", "priority", "P1", "stayed_hours", hours,
                "overdue_flag", flagged, "submitter_user_id", 99L)));
    }

    @ParameterizedTest
    @CsvSource({"17,none", "18,warn", "24,warn", "25,overdue"})
    void thresholdBoundary(int hours, String expected) {
        row(hours, 0);
        scheduler.scan();
        verify(lock).runExclusive(eq("rdm_sla_scan"), eq(0), any());
        if ("none".equals(expected)) {
            verifyNoInteractions(notify);
        } else {
            verify(notify).notifyUserIds(eq("overdue".equals(expected)
                    ? RdmConstants.EVENT_SLA_OVERDUE : RdmConstants.EVENT_SLA_WARN),
                    same(requirement), eq(List.of(99L)), anyString(), anyString());
        }
    }

    @Test
    void extendedSlaClearsOldFlagWithoutFalseWarning() {
        row(3, 1);
        scheduler.scan();
        verify(jdbc).update(contains("SET overdue_flag = 0 WHERE id"), eq(5L));
        verifyNoInteractions(notify);
    }

    @Test
    void sentEventIsDeduplicated() {
        row(25, 1);
        when(jdbc.queryForObject(contains("rdm_notify_log"), eq(Integer.class),
                eq(5L), eq(RdmConstants.EVENT_SLA_OVERDUE), eq(24))).thenReturn(1);
        scheduler.scan();
        verifyNoInteractions(notify);
    }

    @Test
    void noRuleAndLockFailureDoNotSend() {
        row(25, 0);
        when(config.slaHours("evaluating", "P1")).thenReturn(null);
        scheduler.scan();
        verifyNoInteractions(notify);
        doThrow(new IllegalStateException("lock unavailable")).when(lock)
                .runExclusive(anyString(), anyInt(), any());
        scheduler.scan();
        verifyNoInteractions(notify);
    }
}
