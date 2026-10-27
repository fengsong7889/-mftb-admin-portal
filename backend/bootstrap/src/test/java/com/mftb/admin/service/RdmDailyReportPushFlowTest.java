package com.mftb.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.RdmDailyReportVO.Config;
import com.mftb.admin.dto.RdmDailyReportVO.PublicView;
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
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 進度日報推送流程测试（方案 §五「集成」档）：干跑不真发、按规则/项目幂等、两通道解耦、手动档位。
 *
 * <p>这几条都是「一旦坏了不会报错、只会静默做错事」的路径：
 * <ol>
 *   <li><b>dry-run 必须真的不发</b>：联调环境的测试消息打到生产钉钉群是不可撤回事故。
 *       两个开关（方法参数 dryRun 与 yml {@code rdm.notify.dry-run}）都要拦得住，
 *       且干跑时连快照都不落库——否则发送记录里会出现「没发过却有一条记录」的假事实。</li>
 *   <li><b>按范围幂等</b>：作业每分钟 tick，命中后若不去重，重复触发与重启补跑都会重发；
 *       而多规则模型下幂等维度必须是<b>范围</b>（scope_key），不能是全局的「日期+档位」，
 *       否则第二条规则会被第一条挡住。</li>
 *   <li><b>两通道解耦</b>：个人通知没绑应用/没绑钉钉 userId 时只跳过个人，群报照发；反之亦然。</li>
 *   <li><b>手动触发写 manual 档且必须选项目</b>：补发不能被定时幂等拦住；不选项目等于
 *       一次性给全公司刷一遍，必须直接拒。</li>
 * </ol>
 *
 * <p>用真实 {@link RdmDailyReportRenderer}（纯组件、无依赖）而不是 mock：渲染是这条链路里
 * 唯一会把数据变成对外文案的环节，mock 掉它就等于没测。
 */
class RdmDailyReportPushFlowTest {

    private final RdmProjectFactService factService = mock(RdmProjectFactService.class);
    private final RdmNotifyService notifyService = mock(RdmNotifyService.class);
    private final DingTalkAppService dingTalkAppService = mock(DingTalkAppService.class);
    private final NotificationAppService appService = mock(NotificationAppService.class);
    private final SysUserMapper userMapper = mock(SysUserMapper.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);

    /**
     * 被测对象：spy 只为替换两个读库入口（全局配置与快照构建），其余链路走真实实现。
     * <p>三个 queryForObject 按 SQL 片段分别桩：项目存在性（1 个参数）、迭代归属（2 个）、
     * 快照存在性（3 个）——按参数个数桩容易写错，按 SQL 内容桩更贴近真实调用。
     */
    private RdmDailyReportService service(Config cfg, Snapshot snapshot, Integer snapshotExistsCount) {
        RdmDailyReportService real = new RdmDailyReportService(factService, new RdmDailyReportRenderer(),
                notifyService, dingTalkAppService, appService, userMapper, jdbc, new ObjectMapper());
        RdmDailyReportService spy = spy(real);
        doReturn(cfg).when(spy).loadConfig();
        doReturn(snapshot).when(spy).buildSnapshot(any(LocalDate.class), anyString(), anyList(), any());
        when(jdbc.queryForObject(contains("FROM rdm_project"), eq(Integer.class), any())).thenReturn(1);
        when(jdbc.queryForObject(contains("FROM rdm_iteration"), eq(Integer.class), any(), any())).thenReturn(1);
        when(jdbc.queryForObject(contains("FROM rdm_daily_report"), eq(Integer.class), any(), any(), any()))
                .thenReturn(snapshotExistsCount);
        when(jdbc.queryForList(anyString(), eq(String.class))).thenReturn(List.of());
        return spy;
    }

    private Config config(boolean enabled, boolean group, boolean personal) {
        Config c = new Config();
        c.setEnabled(enabled);
        c.setMorningTime("09:00");
        c.setEveningTime("18:00");
        c.setGroupEnabled(group);
        c.setPersonalEnabled(personal);
        c.setReceiverScope("all_projects");
        c.setMorningTemplateKey("group_morning_overview");
        c.setEveningTemplateKey("group_evening_review");
        c.setPersonalTemplateKey("personal_todo");
        return c;
    }

    private Snapshot snapshot(List<com.mftb.admin.dto.RdmDailyReportVO.ProjectNode> projects) {
        Snapshot s = new Snapshot();
        s.setReportDate("2026-10-19");
        s.setReportType("morning");
        s.setReportTypeLabel("晨報");
        Summary sum = new Summary();
        sum.setProjectCount(projects.size());
        s.setSummary(sum);
        s.setProjects(projects);
        return s;
    }

    private Snapshot snapshot() {
        return snapshot(List.of());
    }

    /** 规则推送目标（rule_id=7，项目 3，全部迭代） */
    private RdmDailyReportService.TriggerTarget ruleTarget() {
        return new RdmDailyReportService.TriggerTarget(7L, "A產品日報", 3L, null, "morning", null, null);
    }

    /** 手动推送目标（项目 3 + 迭代 B1） */
    private RdmDailyReportService.TriggerTarget manualTarget(String iteration) {
        return new RdmDailyReportService.TriggerTarget(null, null, 3L, iteration, "morning", null, null);
    }

    /* ==================== dry-run：绝不真发 ==================== */

    @Test
    @DisplayName("看板实时预览：按当前数据现算，不读已落库快照、不发送、不落库")
    void boardPreviewBuildsLiveSnapshotWithoutPersisting() {
        Config cfg = config(true, true, false);
        cfg.setBoardShowRequirements(true);
        cfg.setBoardShowOwners(true);
        cfg.setBoardShowUnassigned(true);
        Snapshot live = snapshot();
        live.setGeneratedAt("2026-10-20 15:30:00");
        live.setUnassignedIterations(new java.util.ArrayList<>());
        RdmDailyReportService svc = service(cfg, live, 0);
        when(jdbc.query(contains("rdm_daily_report_config"), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(cfg));

        PublicView view = svc.boardPreview("morning", 3L, "SP202610001");

        assertTrue(view.isValid());
        assertNotNull(view.getSnapshot());
        assertEquals("2026-10-20 15:30:00", view.getSnapshot().getGeneratedAt(),
                "预览必须带现算时间，不能回放旧快照");
        verify(jdbc, never()).update(anyString(), any(Object[].class));
        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
    }

    @Test
    @DisplayName("干跑：dryRun=true 时不入队群报、不落库快照，但把渲染结果回显给调用方")
    void dryRunNeitherDispatchesNorPersists() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);

        TriggerResult r = svc.push(ruleTarget(), false, null, true);

        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
        assertTrue(r.isDryRun(), "结果必须标明是干跑");
        assertFalse(r.isGroupDispatched(), "干跑不得声称群报已投递");
        assertTrue(r.getGroupTitle() != null && r.getGroupTitle().contains("需求交付"),
                "干跑应回显渲染后的群报标题（新口径：日期+需求交付晨/晚报），实际: " + r.getGroupTitle());
        assertTrue(r.getGroupContent() != null && !r.getGroupContent().isBlank(),
                "干跑应回显渲染后的群报正文，实际: " + r.getGroupContent());
    }

    @Test
    @DisplayName("干跑：yml 的 rdm.notify.dry-run=true 时即使调用方要求真发也不发（环境级开关不被绕过）")
    void ymlDryRunCannotBeBypassedByCaller() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);
        ReflectionTestUtils.setField(svc, "notifyDryRun", true);

        TriggerResult r = svc.push(ruleTarget(), false, null, false);

        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
        assertTrue(r.isDryRun(), "yml 干跑必须反映在结果里，不能被调用方的 dryRun=false 掩盖");
    }

    @Test
    @DisplayName("干跑：个人工作通知同样受干跑约束，不调用钉钉应用接口")
    void dryRunAlsoBlocksPersonalNotification() {
        RdmDailyReportService svc = service(config(true, false, true), snapshot(), 0);
        when(appService.resolve(NotificationAppService.RDM_DAILY_REPORT)).thenReturn(testCredentials());

        svc.push(ruleTarget(), false, null, true);

        verify(dingTalkAppService, never()).sendWorkActionCardPill(anyString(), org.mockito.ArgumentMatchers.anyLong(),
                anyList(), anyString(), anyString(), anyString(), anyString());
    }

    /* ==================== 全局开关 ==================== */

    @Test
    @DisplayName("全局总开关关闭：定时与手动都不出站，并给出可读结论")
    void masterSwitchStopsEverything() {
        RdmDailyReportService svc = service(config(false, true, true), snapshot(), 0);

        TriggerResult r = svc.push(ruleTarget(), false, null, false);

        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
        assertFalse(r.isGroupDispatched());
        assertTrue(r.getMessage().contains("总开关"), "结论应说明被总开关拦下: " + r.getMessage());
    }

    /* ==================== 按范围幂等 ==================== */

    @Test
    @DisplayName("按范围幂等：该规则当日该档快照已存在则跳过，绝不重复刷屏")
    void ruleRunSkipsWhenSnapshotExists() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 1);

        TriggerResult r = svc.push(ruleTarget(), false, null, false);

        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
        assertFalse(r.isGroupDispatched());
        assertTrue(r.getMessage().contains("已存在"), "应说明因已存在而跳过: " + r.getMessage());
    }

    @Test
    @DisplayName("同一规则重复 tick 只发一次：首次入队，第二次因快照已存在而跳过")
    void repeatedTickSendsOnlyOnce() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);
        when(jdbc.queryForObject(contains("FROM rdm_daily_report"), eq(Integer.class), any(), any(), any()))
                .thenReturn(0, 1);

        TriggerResult first = svc.push(ruleTarget(), false, null, false);
        TriggerResult second = svc.push(ruleTarget(), false, null, false);

        assertTrue(first.isGroupDispatched(), "首次 tick 应入队投递");
        assertFalse(second.isGroupDispatched(), "第二次 tick 必须跳过");
        verify(notifyService, times(1)).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
    }

    @Test
    @DisplayName("幂等按范围而非全局：另一条规则（不同 rule_id）同日同档不受前一条影响")
    void idempotencyIsScopedPerRule() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);
        // 第一条规则已存在快照 → 跳过；第二条规则尚无快照 → 必须发出
        when(jdbc.queryForObject(contains("FROM rdm_daily_report"), eq(Integer.class), any(), any(), any()))
                .thenReturn(1, 0);

        TriggerResult firstRule = svc.push(ruleTarget(), false, null, false);
        RdmDailyReportService.TriggerTarget anotherRule = new RdmDailyReportService.TriggerTarget(
                8L, "B產品日報", 4L, null, "morning", null, null);
        TriggerResult secondRule = svc.push(anotherRule, false, null, false);

        assertFalse(firstRule.isGroupDispatched(), "第一条规则已推送过，应跳过");
        assertTrue(secondRule.isGroupDispatched(), "第二条规则是不同范围，必须能发出（旧全局唯一键会把它挡住）");
    }

    @Test
    @DisplayName("手动触发不受定时幂等约束：当日快照已存在也能补发")
    void manualTriggerIsNotBlockedByIdempotencyGuard() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 1);

        TriggerResult r = svc.push(manualTarget(null), true, "管理員", false);

        assertTrue(r.isGroupDispatched(), "手动补发必须能发出去");
        verify(notifyService, times(1)).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
    }

    /* ==================== 手动档位与落库 ==================== */

    @Test
    @DisplayName("手动触发写 manual 档：结果的 reportType 为 manual，与规则行分开各自自洽")
    void manualTriggerUsesManualReportType() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);

        TriggerResult manual = svc.push(manualTarget("SP202610001"), true, "管理員", false);
        assertEquals("manual", manual.getReportType(),
                "手动触发必须落 manual 档，否则会占用定时档的幂等行、把规则推送挤掉");

        TriggerResult rule = svc.push(ruleTarget(), false, null, false);
        assertEquals("morning", rule.getReportType(), "规则推送落内容档位 morning");
    }

    @Test
    @DisplayName("落库：真发时写入快照行，report_type/触发方式/范围键随目标而变")
    void persistsSnapshotWithTriggerMetadata() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);

        svc.push(ruleTarget(), false, null, false);

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(anyString(), args.capture());
        // 用 Arrays.asList 而不是 List.of：定时触发的 trigger_by 就是 null（非人为），List.of 会直接 NPE
        List<Object> flat = java.util.Arrays.asList(args.getValue());
        assertTrue(flat.contains("morning"), "规则推送应落 morning 档，实际参数: " + flat);
        assertTrue(flat.contains("schedule"), "触发方式应记为 schedule，实际参数: " + flat);
        assertTrue(flat.contains("rule:7"), "范围键应为 rule:7，实际参数: " + flat);
        assertEquals(7L, flat.get(3), "rule_id 应落 7");
        assertEquals(3L, flat.get(4), "project_id 应落目标项目 3");
        assertTrue(flat.contains(null), "定时触发无操作人，trigger_by 应为 null 而不是伪造一个系统账号");
    }

    @Test
    @DisplayName("落库：手动按迭代推送时范围键带项目与迭代，与同项目的手动补发互不覆盖")
    void manualScopeKeyCarriesIteration() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);

        svc.push(manualTarget("SP202610001"), true, "管理員", false);

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(anyString(), args.capture());
        List<Object> flat = java.util.Arrays.asList(args.getValue());
        assertTrue(flat.contains("manual:3:SP202610001"), "范围键应带项目与迭代，实际: " + flat);
        assertTrue(flat.contains("manual"), "report_type 应为 manual");
        assertTrue(flat.contains("管理員"), "trigger_by 应记录手动触发人");
    }

    /* ==================== 两通道解耦 ==================== */

    @Test
    @DisplayName("解耦：个人通知场景未绑定应用时只跳过个人，群报照发")
    void groupReportStillSendsWhenPersonalAppUnbound() {
        RdmDailyReportService svc = service(config(true, true, true), snapshot(), 0);
        when(appService.resolve(NotificationAppService.RDM_DAILY_REPORT)).thenReturn(null);

        TriggerResult r = svc.push(ruleTarget(), false, null, false);

        assertTrue(r.isGroupDispatched(), "个人通道未就绪不得阻塞群报");
        verify(notifyService, times(1)).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
        assertEquals(0, r.getPersonalSent());
        verify(dingTalkAppService, never()).sendWorkActionCardPill(anyString(), org.mockito.ArgumentMatchers.anyLong(),
                anyList(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("解耦：群报关闭时不发群消息，但个人工作通知照常执行")
    void personalStillSendsWhenGroupDisabled() {
        var project = new com.mftb.admin.dto.RdmDailyReportVO.ProjectNode();
        project.setProjectId(3L);
        project.setProjectNo("PROJ2026101901");
        project.setProjectName("項目A");
        project.setPmUserId(77L);
        Snapshot s = snapshot(List.of(project));

        RdmDailyReportService svc = service(config(true, false, true), s, 0);
        when(appService.resolve(NotificationAppService.RDM_DAILY_REPORT)).thenReturn(testCredentials());
        SysUser pm = new SysUser();
        pm.setId(77L);
        pm.setName("張三");
        pm.setDingtalkUserId("ding-77");
        when(userMapper.selectById(77L)).thenReturn(pm);

        TriggerResult r = svc.push(ruleTarget(), false, null, false);

        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
        assertFalse(r.isGroupDispatched(), "群报开关关闭时不得入队群消息");
        assertEquals(1, r.getPersonalSent(), "个人通知应独立发出");
        verify(dingTalkAppService).sendWorkActionCardPill(eq(NotificationAppService.RDM_DAILY_REPORT), eq(9L),
                eq(List.of("ding-77")), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("fail-closed：负责人未绑定钉钉 userId 时跳过该人，不降级成群发或按手机号群发")
    void skipsReceiverWithoutDingtalkUserId() {
        var project = new com.mftb.admin.dto.RdmDailyReportVO.ProjectNode();
        project.setProjectId(3L);
        project.setPmUserId(88L);
        Snapshot s = snapshot(List.of(project));

        RdmDailyReportService svc = service(config(true, false, true), s, 0);
        when(appService.resolve(NotificationAppService.RDM_DAILY_REPORT)).thenReturn(testCredentials());
        SysUser pm = new SysUser();
        pm.setId(88L);
        pm.setName("李四");
        pm.setDingtalkUserId(null);
        when(userMapper.selectById(88L)).thenReturn(pm);

        TriggerResult r = svc.push(ruleTarget(), false, null, false);

        assertEquals(0, r.getPersonalSent());
        assertEquals(1, r.getPersonalSkipped(), "未绑定者应计入跳过，便于运维发现漏绑");
        verify(dingTalkAppService, never()).sendWorkActionCardPill(anyString(), org.mockito.ArgumentMatchers.anyLong(),
                anyList(), anyString(), anyString(), anyString(), anyString());
    }

    /* ==================== 手动触发的发送对象 ==================== */

    @Test
    @DisplayName("仅群聊：群报照发，任何个人通知都不发")
    void groupOnlySkipsAllPersonal() {
        var project = new com.mftb.admin.dto.RdmDailyReportVO.ProjectNode();
        project.setProjectId(3L);
        project.setProjectNo("PROJ2026101901");
        project.setProjectName("項目A");
        project.setPmUserId(77L);
        RdmDailyReportService svc = service(config(true, true, true), snapshot(List.of(project)), 0);
        when(appService.resolve(NotificationAppService.RDM_DAILY_REPORT)).thenReturn(testCredentials());
        SysUser pm = new SysUser();
        pm.setId(77L);
        pm.setName("張三");
        pm.setDingtalkUserId("ding-77");
        when(userMapper.selectById(77L)).thenReturn(pm);

        TriggerResult r = svc.push(manualTarget(null), true, "管理員", false,
                new RdmDailyReportService.RecipientOverride("group", List.of()));

        assertTrue(r.isGroupDispatched());
        assertEquals(0, r.getPersonalSent(), "仅群聊不得发个人通知");
        verify(dingTalkAppService, never()).sendWorkActionCardPill(anyString(), org.mockito.ArgumentMatchers.anyLong(),
                anyList(), anyString(), anyString(), anyString(), anyString());
        verify(dingTalkAppService, never()).sendWorkNotification(anyString(), org.mockito.ArgumentMatchers.anyLong(),
                anyList(), anyString(), anyString());
    }

    @Test
    @DisplayName("仅指定人：不发群，且只发给选中的人（配置收件人里的其他人不打扰）")
    void usersOnlySendsToSelectedPeople() {
        var project = new com.mftb.admin.dto.RdmDailyReportVO.ProjectNode();
        project.setProjectId(3L);
        project.setProjectNo("PROJ2026101901");
        project.setProjectName("項目A");
        project.setPmUserId(77L);
        RdmDailyReportService svc = service(config(true, true, true), snapshot(List.of(project)), 0);
        when(appService.resolve(NotificationAppService.RDM_DAILY_REPORT)).thenReturn(testCredentials());
        SysUser pm = new SysUser();
        pm.setId(77L);
        pm.setName("張三");
        pm.setDingtalkUserId("ding-77");
        SysUser selected = new SysUser();
        selected.setId(88L);
        selected.setName("李四");
        selected.setDingtalkUserId("ding-88");
        when(userMapper.selectById(77L)).thenReturn(pm);
        when(userMapper.selectById(88L)).thenReturn(selected);

        TriggerResult r = svc.push(manualTarget(null), true, "管理員", false,
                new RdmDailyReportService.RecipientOverride("users", List.of(88L)));

        assertFalse(r.isGroupDispatched(), "仅指定人不得发群");
        assertEquals(1, r.getPersonalSent());
        org.mockito.ArgumentCaptor<List<String>> captor = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(dingTalkAppService).sendWorkActionCardPill(eq(NotificationAppService.RDM_DAILY_REPORT), eq(9L),
                captor.capture(), anyString(), anyString(), anyString(), anyString());
        assertEquals(List.of("ding-88"), captor.getValue(), "只应发给被选中的人");
    }

    @Test
    @DisplayName("仅指定人但个人渠道已关闭：直接拒绝，不能绕过管理员关掉的闸")
    void usersModeRejectedWhenPersonalDisabled() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);

        com.mftb.admin.common.BusinessException ex = assertThrows(
                com.mftb.admin.common.BusinessException.class,
                () -> svc.push(manualTarget(null), true, "管理員", false,
                        new RdmDailyReportService.RecipientOverride("users", List.of(88L))));
        assertTrue(ex.getMessage().contains("個人通知渠道"), ex.getMessage());
        verify(dingTalkAppService, never()).sendWorkActionCardPill(anyString(), org.mockito.ArgumentMatchers.anyLong(),
                anyList(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("节流按发送对象分别计时：刚发完群，立刻发个人不被拦")
    void throttleKeyedByRecipient() {
        RdmDailyReportService svc = service(config(true, true, true), snapshot(), 0);

        assertNull(svc.checkManualThrottle("morning", 3L, "group", 1000L));
        assertNull(svc.checkManualThrottle("morning", 3L, "users:88", 1500L),
                "不同发送对象不应共享节流窗口");
        assertNotNull(svc.checkManualThrottle("morning", 3L, "users:88", 2000L),
                "同一发送对象仍应受 1 分钟节流约束");
    }

    /* ==================== 手动触发入口校验 ==================== */

    @Test
    @DisplayName("手动触发必须选项目：不选直接拒（否则等于一次性给全公司刷一遍）")
    void manualTriggerRequiresProject() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);

        com.mftb.admin.common.BusinessException ex = assertThrows(
                com.mftb.admin.common.BusinessException.class,
                () -> svc.triggerManual("morning", (Long) null, null, "管理員", false));
        assertTrue(ex.getMessage().contains("項目") || ex.getMessage().contains("项目"),
                "应提示必须选择项目: " + ex.getMessage());
        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
    }

    @Test
    @DisplayName("手动触发：指定迭代时必须属于该项目，否则拒绝（避免每天把别的项目的迭代推到群里）")
    void manualTriggerRejectsIterationOfAnotherProject() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);
        when(jdbc.queryForObject(contains("FROM rdm_iteration"), eq(Integer.class), any(), any())).thenReturn(0);

        com.mftb.admin.common.BusinessException ex = assertThrows(
                com.mftb.admin.common.BusinessException.class,
                () -> svc.triggerManual("morning", 3L, "SP202610999", "管理員", false));
        assertTrue(ex.getMessage().contains("迭代"), "应提示迭代不属该项目: " + ex.getMessage());
    }

    @Test
    @DisplayName("手动触发：项目不存在时拒绝，不静默发出一份空日报")
    void manualTriggerRejectsMissingProject() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);
        when(jdbc.queryForObject(contains("FROM rdm_project"), eq(Integer.class), any())).thenReturn(0);

        assertThrows(com.mftb.admin.common.BusinessException.class,
                () -> svc.triggerManual("morning", 999L, null, "管理員", false));
        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
    }

    @Test
    @DisplayName("非法档位在推送前就被拒绝，不会误发成晨报")
    void rejectsInvalidSlotBeforeSending() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);

        assertThrows(com.mftb.admin.common.BusinessException.class,
                () -> svc.push(new RdmDailyReportService.TriggerTarget(7L, "x", 3L, null, "noon", null, null),
                        false, null, false));
        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
    }

    @Test
    @DisplayName("手动触发节流：同一档位+项目一分钟内重复真发被拒；干跑不受节流约束")
    void manualThrottleBlocksSecondPush() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);

        svc.push(manualTarget(null), true, "管理員", false);
        com.mftb.admin.common.BusinessException ex = assertThrows(
                com.mftb.admin.common.BusinessException.class,
                () -> svc.push(manualTarget(null), true, "管理員", false));
        assertTrue(ex.getMessage().contains("1 分鐘"), "应给出可读的节流原因: " + ex.getMessage());
        verify(notifyService, times(1)).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());

        // 干跑不受节流约束：预览可以反复点
        svc.push(manualTarget(null), true, "管理員", true);
        verify(notifyService, times(1)).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
    }

    @Test
    @DisplayName("同一实例上：被总开关拦下的手动尝试之后，开关打开即可立刻补发")
    void throttleWindowNotConsumedWhenSwitchBlocked() {
        RdmDailyReportService svc = service(config(false, true, false), snapshot(), 0);
        svc.push(manualTarget(null), true, "管理員", false);

        Config on = config(true, true, false);
        doReturn(on).when(svc).loadConfig();
        TriggerResult r = svc.push(manualTarget(null), true, "管理員", false);

        assertTrue(r.isGroupDispatched(),
                "被开关拦下的尝试不得消耗节流窗口，否则管理员刚开开关就要等 1 分钟");
    }

    /* ==================== 定时入口 ==================== */

    @Test
    @DisplayName("定时入口 runRule：按规则推送，触发方式记为 schedule 而非人为")
    void runRuleUsesScheduleTrigger() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);
        com.mftb.admin.dto.RdmDailyReportVO.Rule rule = new com.mftb.admin.dto.RdmDailyReportVO.Rule();
        rule.setId(7L);
        rule.setName("A產品日報");
        rule.setProjectId(3L);
        rule.setContentType("morning");
        doReturn(rule).when(svc).findRule(7L);

        TriggerResult r = svc.runRule(7L);

        assertEquals("morning", r.getReportType());
        assertTrue(r.isGroupDispatched());
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(anyString(), args.capture());
        List<Object> flat = java.util.Arrays.asList(args.getValue());
        assertTrue(flat.contains("schedule"), "定时触发方式应记为 schedule，实际: " + flat);
        assertFalse(flat.contains("manual"), "定时不得记成手动");
        assertEquals(0, r.getPersonalSent(), "个人通知关闭时不应有人收到工作通知");
    }

    @Test
    @DisplayName("定时入口：规则不存在时不抛异常，返回可读的跳过结论（避免作业层反复报错）")
    void runRuleHandlesMissingRule() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);
        doReturn(null).when(svc).findRule(99L);

        TriggerResult r = svc.runRule(99L);

        assertFalse(r.isGroupDispatched());
        assertTrue(r.getMessage().contains("規則不存在"), "应说明规则已不存在: " + r.getMessage());
        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
    }

    @Test
    @DisplayName("定时规则查询不得 JOIN 迭代表：code 排序规则不一致，真库会 1267")
    void rulesDueAtMustNotJoinIterationTable() {
        RdmDailyReportService svc = service(config(true, true, false), snapshot(), 0);
        when(jdbc.query(contains("FROM rdm_daily_report_rule"),
                any(org.springframework.jdbc.core.RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        svc.rulesDueAt(java.time.LocalTime.of(9, 0));

        verify(jdbc).query(
                argThat((String sql) -> sql.contains("rdm_daily_report_rule") && !sql.contains("rdm_iteration")),
                any(org.springframework.jdbc.core.RowMapper.class), any(Object[].class));
    }

    @Test
    @DisplayName("按範圍鍵讀快照：多項目/全部項目沒有 projectId 也能精確命中對應行")
    void getSnapshotUsesScopeKeyWhenPresent() throws Exception {
        RdmDailyReportService svc = service(config(true, false, false), snapshot(), 0);
        Snapshot stored = snapshot();
        stored.setScopeLabel("全部在途項目");
        when(jdbc.queryForList(contains("scope_key = ?"), eq(String.class), any(), any(), any()))
                .thenReturn(List.of(new ObjectMapper().writeValueAsString(stored)));

        Snapshot got = svc.getSnapshot(LocalDate.of(2026, 10, 19), "manual", null, null, "manual:all");

        assertNotNull(got, "带范围键时应能读到快照，而不是依赖最新一条");
        assertEquals("全部在途項目", got.getScopeLabel());
        verify(jdbc).queryForList(contains("scope_key = ?"), eq(String.class),
                eq("2026-10-19"), eq("manual"), eq("manual:all"));
    }

    /* ==================== 无异常日降噪 ==================== */

    /** 干净日快照：无逾期、无到期、无风险，只有一个不关注的项目 */
    private Snapshot cleanSnapshot() {
        var project = new com.mftb.admin.dto.RdmDailyReportVO.ProjectNode();
        project.setProjectId(3L);
        project.setProjectName("項目A");
        return snapshot(List.of(project));
    }

    @Test
    @DisplayName("降噪 brief：无异常日只发一句结论，不再铺开项目清单")
    void quietBriefCompressesCleanDay() {
        Config cfg = config(true, true, false);
        cfg.setMessageMode("fixed");
        cfg.setQuietPolicy("brief");
        RdmDailyReportService svc = service(cfg, cleanSnapshot(), 0);

        TriggerResult r = svc.push(ruleTarget(), false, null, false);

        assertTrue(r.isGroupDispatched(), "brief 仍要发一条，不能静默");
        assertTrue(r.getGroupContent().contains("今日無異常"), r.getGroupContent());
        assertFalse(r.getGroupContent().contains("需關注"), "无异常日不应出现需关注块: " + r.getGroupContent());
        assertTrue(r.getGroupTitle().contains("需求交付"),
                "brief 标题同新口径（日期+需求交付晨/晚报），实际: " + r.getGroupTitle());
    }

    @Test
    @DisplayName("降噪 skip：无异常日不发群报与个人，但快照照落库（可打开日报、定时不重试）")
    void quietSkipSkipsSendingButKeepsSnapshot() {
        Config cfg = config(true, true, true);
        cfg.setMessageMode("fixed");
        cfg.setQuietPolicy("skip");
        RdmDailyReportService svc = service(cfg, cleanSnapshot(), 0);

        TriggerResult r = svc.push(ruleTarget(), false, null, false);

        assertFalse(r.isGroupDispatched(), "skip 不得入队群消息");
        assertEquals(0, r.getPersonalSent());
        assertEquals(0, r.getPersonalSkipped(), "策略性不发不是异常跳过，不能计进 skipped");
        assertTrue(r.getMessage().contains("降噪"), "结果要能解释为什么没发: " + r.getMessage());
        verify(notifyService, never()).notifyUsers(anyString(), any(), anyList(), anyString(), anyString());
        verify(notifyService, never()).notifyActionCard(anyString(), anyString(), anyString(), anyString(), anyString());
        verify(dingTalkAppService, never()).sendWorkActionCardPill(anyString(), org.mockito.ArgumentMatchers.anyLong(),
                anyList(), anyString(), anyString(), anyString(), anyString());
        // 快照仍要落库：不落快照，定时任务下次 tick 会重跑、详情页也没有内容
        verify(jdbc, atLeastOnce()).update(contains("INSERT INTO rdm_daily_report"), any(Object[].class));
    }

    @Test
    @DisplayName("降噪不适用于异常日：有逾期时即使配了 skip 也照常发完整摘要")
    void quietSkipIgnoredWhenAbnormal() {
        Config cfg = config(true, true, false);
        cfg.setMessageMode("fixed");
        cfg.setQuietPolicy("skip");
        Snapshot dirty = cleanSnapshot();
        dirty.getSummary().setOverdueItemCount(1);
        RdmDailyReportService svc = service(cfg, dirty, 0);

        TriggerResult r = svc.push(ruleTarget(), false, null, false);

        assertTrue(r.isGroupDispatched(), "有逾期必须照常发");
        assertTrue(r.getGroupContent().contains("項目A"),
                "异常日应发完整两级清单，实际: " + r.getGroupContent());
        assertFalse(r.getGroupContent().startsWith("✅ **今日無異常**"),
                "异常日不得收敛成一句话，实际: " + r.getGroupContent());
    }

    @Test
    @DisplayName("降噪不适用于干跑：预览即使配了 skip 也要渲染出内容（否则预览空白）")
    void quietSkipIgnoredForDryRun() {
        Config cfg = config(true, true, false);
        cfg.setMessageMode("fixed");
        cfg.setQuietPolicy("skip");
        RdmDailyReportService svc = service(cfg, cleanSnapshot(), 0);

        TriggerResult r = svc.push(ruleTarget(), false, null, true);

        assertTrue(r.isDryRun());
        assertTrue(r.getGroupContent() != null && !r.getGroupContent().isBlank(),
                "干跑要能看到渲染结果，实际: " + r.getGroupContent());
    }

    /** 测试用的企业应用凭据快照（构造参数顺序：id, appKey, appSecret, agentId, baseUrl, enabled） */
    private static Credentials testCredentials() {
        return new Credentials(9L, "test-app-key", "test-app-secret", "123456",
                "https://portal.example", true);
    }
}
