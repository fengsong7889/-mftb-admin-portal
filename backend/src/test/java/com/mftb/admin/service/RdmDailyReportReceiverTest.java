package com.mftb.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmDailyReportVO.Config;
import com.mftb.admin.dto.RdmDailyReportVO.ConfigForm;
import com.mftb.admin.dto.RdmDailyReportVO.ProjectNode;
import com.mftb.admin.dto.RdmDailyReportVO.Snapshot;
import com.mftb.admin.dto.RdmDailyReportVO.Summary;
import com.mftb.admin.dto.RdmDailyReportVO.TriggerResult;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.NotificationAppService.Credentials;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.test.util.ReflectionTestUtils;

import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 个人日报收件人口径测试（v3.26）：角色推导 ∪ 追加名单 − 排除名单。
 *
 * <p>这几条共同的失效模式是「不报错、只静默少发或多发」：
 * <ol>
 *   <li><b>角色重复</b>：同一人既是项目经理又是产品负责人，若按角色各发一次就是刷屏；</li>
 *   <li><b>追加人视角</b>：追加收件人没有项目归属，必须拿到规则范围全量，否则收到空日报；</li>
 *   <li><b>排除优先级</b>：排除名单必须晚于合并生效，否则「已排除」的人仍会收到；</li>
 *   <li><b>成员表</b>：勾选「專案成員」时要一次批量查，逐项目回查在全部项目规则下就是 N+1；</li>
 *   <li><b>缺省不重置</b>：旧客户端不传收件人字段时必须回落库中现值，不能静默重置成默认角色。</li>
 * </ol>
 */
class RdmDailyReportReceiverTest {

    private final RdmProjectFactService factService = mock(RdmProjectFactService.class);
    private final RdmNotifyService notifyService = mock(RdmNotifyService.class);
    private final DingTalkAppService dingTalkAppService = mock(DingTalkAppService.class);
    private final NotificationAppService appService = mock(NotificationAppService.class);
    private final SysUserMapper userMapper = mock(SysUserMapper.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    private RdmDailyReportService service(Config cfg, Snapshot snapshot) {
        RdmDailyReportService real = new RdmDailyReportService(factService, new RdmDailyReportRenderer(),
                notifyService, dingTalkAppService, appService, userMapper, jdbc, new ObjectMapper());
        ReflectionTestUtils.setField(real, "jwtSecret", "receiver-test-secret");
        RdmDailyReportService spy = spy(real);
        doReturn(cfg).when(spy).loadConfig();
        doReturn(snapshot).when(spy).buildSnapshot(any(LocalDate.class), anyString(), anyList(), any());
        when(jdbc.queryForObject(contains("FROM rdm_project"), eq(Integer.class), any())).thenReturn(1);
        when(jdbc.queryForObject(contains("FROM rdm_iteration"), eq(Integer.class), any(), any())).thenReturn(1);
        when(jdbc.queryForObject(contains("FROM rdm_daily_report"), eq(Integer.class), any(), any(), any()))
                .thenReturn(0);
        when(jdbc.queryForList(anyString(), eq(String.class))).thenReturn(List.of());
        when(appService.resolve(NotificationAppService.RDM_DAILY_REPORT)).thenReturn(testCredentials());
        return spy;
    }

    /** 配置：群报关闭、个人开启，收件人三字段由各用例决定 */
    private Config config(List<String> roles, List<Long> extra, List<Long> exclude) {
        Config c = new Config();
        c.setEnabled(true);
        c.setMorningTime("09:00");
        c.setEveningTime("18:00");
        c.setGroupEnabled(false);
        c.setPersonalEnabled(true);
        c.setReceiverRoles(roles);
        c.setExtraReceiverUserIds(extra);
        c.setExcludeReceiverUserIds(exclude);
        c.setMorningTemplateKey("group_morning_overview");
        c.setEveningTemplateKey("group_evening_review");
        c.setPersonalTemplateKey("personal_todo");
        c.setMessageMode("fixed");
        // 本文件的用例考察"发给谁"，不考察降噪：置 full 避免无异常日被压成一句话而干扰正文断言
        c.setQuietPolicy("full");
        return c;
    }

    private ProjectNode project(long id, String name) {
        ProjectNode p = new ProjectNode();
        p.setProjectId(id);
        p.setProjectName(name);
        return p;
    }

    private SysUser user(long id, String name, String dingtalkUserId) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setName(name);
        u.setDingtalkUserId(dingtalkUserId);
        return u;
    }

    private Snapshot snapshot(List<ProjectNode> projects) {
        Snapshot s = new Snapshot();
        s.setReportDate("2026-10-21");
        s.setReportType("morning");
        s.setReportTypeLabel("晨報");
        Summary sum = new Summary();
        sum.setProjectCount(projects.size());
        s.setSummary(sum);
        s.setProjects(projects);
        return s;
    }

    private RdmDailyReportService.TriggerTarget target() {
        return new RdmDailyReportService.TriggerTarget(7L, "A產品日報", null, null, "morning", null, null);
    }

    private static Credentials testCredentials() {
        return new Credentials(9L, "test-app-key", "test-app-secret", "123456",
                "https://portal.example", true);
    }

    @Test
    @DisplayName("角色推导：只勾技术负责人时，PM 不应收到")
    void roleDrivesReceiver() {
        ProjectNode p = project(3L, "項目A");
        p.setPmUserId(77L);
        p.setTechLeadUserId(11L);
        RdmDailyReportService svc = service(config(List.of("tech_lead"), List.of(), List.of()), snapshot(List.of(p)));
        when(userMapper.selectById(11L)).thenReturn(user(11L, "技術", "ding-11"));

        TriggerResult r = svc.push(target(), false, null, false);

        assertEquals(1, r.getPersonalSent());
        verify(dingTalkAppService).sendWorkActionCard(eq(NotificationAppService.RDM_DAILY_REPORT), eq(9L),
                eq(List.of("ding-11")), anyString(), anyString(), anyString(), anyString());
        verify(dingTalkAppService, never()).sendWorkActionCard(anyString(), anyLong(),
                eq(List.of("ding-77")), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("去重：同一人既是项目经理又是产品负责人时只发一条")
    void duplicateRolesSendOnce() {
        ProjectNode p = project(3L, "項目A");
        p.setPmUserId(77L);
        p.setProductOwnerUserId(77L);
        RdmDailyReportService svc = service(
                config(List.of("pm", "product_owner"), List.of(), List.of()), snapshot(List.of(p)));
        when(userMapper.selectById(77L)).thenReturn(user(77L, "張三", "ding-77"));

        TriggerResult r = svc.push(target(), false, null, false);

        assertEquals(1, r.getPersonalSent(), "一人一条，不能按角色各发一次");
        verify(dingTalkAppService).sendWorkActionCard(eq(NotificationAppService.RDM_DAILY_REPORT), eq(9L),
                eq(List.of("ding-77")), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("追加收件人：没有项目角色也能收到，且内容覆盖规则范围内全部项目")
    void extraReceiverGetsAllProjects() {
        ProjectNode a = project(3L, "項目A");
        ProjectNode b = project(4L, "項目B");
        RdmDailyReportService svc = service(
                config(List.of(), List.of(99L), List.of()), snapshot(List.of(a, b)));
        when(userMapper.selectById(99L)).thenReturn(user(99L, "PMO", "ding-99"));

        TriggerResult r = svc.push(target(), false, null, false);

        assertEquals(1, r.getPersonalSent(), "追加收件人独立生效");
        ArgumentCaptor<String> content = ArgumentCaptor.forClass(String.class);
        verify(dingTalkAppService).sendWorkActionCard(eq(NotificationAppService.RDM_DAILY_REPORT), eq(9L),
                eq(List.of("ding-99")), anyString(), content.capture(), anyString(), anyString());
        assertTrue(content.getValue().contains("項目A"), "追加人应看到全部项目，实际: " + content.getValue());
        assertTrue(content.getValue().contains("項目B"), "追加人应看到全部项目，实际: " + content.getValue());
    }

    @Test
    @DisplayName("排除优先：角色命中但被排除的人不发，也不计入跳过")
    void excludeWinsOverRole() {
        ProjectNode p = project(3L, "項目A");
        p.setPmUserId(77L);
        RdmDailyReportService svc = service(
                config(List.of("pm"), List.of(), List.of(77L)), snapshot(List.of(p)));
        when(userMapper.selectById(77L)).thenReturn(user(77L, "張三", "ding-77"));

        TriggerResult r = svc.push(target(), false, null, false);

        assertEquals(0, r.getPersonalSent());
        assertEquals(0, r.getPersonalSkipped(), "被排除不是异常，不应计入跳过");
        verify(dingTalkAppService, never()).sendWorkActionCard(anyString(), anyLong(), anyList(),
                anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("fail-closed：角色命中但未绑定钉钉时跳过该人，不计入已发送")
    void unboundDingtalkSkipped() {
        ProjectNode p = project(3L, "項目A");
        p.setQaLeadUserId(88L);
        RdmDailyReportService svc = service(
                config(List.of("qa_lead"), List.of(), List.of()), snapshot(List.of(p)));
        when(userMapper.selectById(88L)).thenReturn(user(88L, "測試", null));

        TriggerResult r = svc.push(target(), false, null, false);

        assertEquals(0, r.getPersonalSent());
        assertEquals(1, r.getPersonalSkipped(), "未绑定者应计入跳过，便于运维发现漏绑");
    }

    @Test
    @DisplayName("专案成员：一次批量查成员表即可把成员纳入收件人")
    void projectMemberCollected() {
        ProjectNode p = project(3L, "項目A");
        RdmDailyReportService svc = service(
                config(List.of("project_member"), List.of(), List.of()), snapshot(List.of(p)));
        doAnswer(inv -> {
            RowCallbackHandler handler = inv.getArgument(1);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getLong("project_id")).thenReturn(3L);
            when(rs.getLong("user_id")).thenReturn(55L);
            handler.processRow(rs);
            return null;
        }).when(jdbc).query(contains("rdm_project_member"), any(RowCallbackHandler.class), any(Object[].class));
        when(userMapper.selectById(55L)).thenReturn(user(55L, "成員", "ding-55"));

        TriggerResult r = svc.push(target(), false, null, false);

        assertEquals(1, r.getPersonalSent());
        verify(dingTalkAppService).sendWorkActionCard(eq(NotificationAppService.RDM_DAILY_REPORT), eq(9L),
                eq(List.of("ding-55")), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("兼容旧调用方：收件角色为 null 时回落默认的 PM + 产品负责人")
    void nullRolesFallbackToDefault() {
        ProjectNode p = project(3L, "項目A");
        p.setPmUserId(77L);
        Config cfg = config(null, List.of(), List.of());
        RdmDailyReportService svc = service(cfg, snapshot(List.of(p)));
        when(userMapper.selectById(77L)).thenReturn(user(77L, "張三", "ding-77"));

        TriggerResult r = svc.push(target(), false, null, false);

        assertEquals(1, r.getPersonalSent(), "字段缺失应按现状口径发送，不能变成无人可发");
    }

    @Test
    @DisplayName("保存校验：角色为空且没有追加人时直接拒绝，避免开了个人渠道却无人可发")
    void saveRejectsEmptyReceivers() {
        RdmDailyReportService svc = service(config(List.of("pm"), List.of(), List.of()), snapshot(List.of()));
        ConfigForm form = new ConfigForm();
        form.setReceiverRoles(new ArrayList<>());
        form.setExtraReceiverUserIds(new ArrayList<>());
        form.setExcludeReceiverUserIds(new ArrayList<>());

        BusinessException ex = assertThrows(BusinessException.class, () -> svc.saveConfig(form, "tester"));
        assertTrue(ex.getMessage().contains("至少需要選擇一個收件角色"), "实际: " + ex.getMessage());
    }

    @Test
    @DisplayName("保存校验：非法角色码直接拒绝，不做静默丢弃")
    void saveRejectsUnknownRole() {
        RdmDailyReportService svc = service(config(List.of("pm"), List.of(), List.of()), snapshot(List.of()));
        ConfigForm form = new ConfigForm();
        form.setReceiverRoles(List.of("ceo"));
        form.setExtraReceiverUserIds(new ArrayList<>());
        form.setExcludeReceiverUserIds(new ArrayList<>());

        BusinessException ex = assertThrows(BusinessException.class, () -> svc.saveConfig(form, "tester"));
        assertTrue(ex.getMessage().contains("不支持的收件角色"), "实际: " + ex.getMessage());
    }
}
