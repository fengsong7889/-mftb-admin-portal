package com.mftb.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.RdmDailyReportVO.Config;
import com.mftb.admin.dto.RdmDailyReportVO.IterationNode;
import com.mftb.admin.dto.RdmDailyReportVO.ProjectNode;
import com.mftb.admin.dto.RdmDailyReportVO.PublicView;
import com.mftb.admin.dto.RdmDailyReportVO.RequirementNode;
import com.mftb.admin.dto.RdmDailyReportVO.Snapshot;
import com.mftb.admin.dto.RdmDailyReportVO.Summary;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.RdmDailyReportViewTokenUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 日報看板開放頁取數單測。
 *
 * <p>釘住三條安全邊界：
 * <ol>
 *   <li><b>過期即失效</b>：令牌簽名正確但超過有效期，不能出數據；</li>
 *   <li><b>展示參數只裁剪內容</b>：關閉需求明細/負責人後，返回結構裡對應字段為空，但快照指標不動；</li>
 *   <li><b>站內詳情鏈接一律剔除</b>：開放頁不能把讀者帶回需要登錄的詳情頁。</li>
 * </ol>
 */
class RdmDailyReportPublicViewTest {

    private static final String JWT_SECRET = "test-jwt-secret";
    private static final String SECRET = "rdm-daily-view:" + JWT_SECRET;
    private static final LocalDate DAY = LocalDate.of(2026, 10, 20);

    private JdbcTemplate jdbc;
    private ObjectMapper objectMapper;
    private RdmDailyReportService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        objectMapper = new ObjectMapper();
        service = new RdmDailyReportService(
                mock(RdmProjectFactService.class),
                mock(RdmDailyReportRenderer.class),
                mock(RdmNotifyService.class),
                mock(DingTalkAppService.class),
                mock(NotificationAppService.class),
                mock(SysUserMapper.class),
                jdbc,
                objectMapper);
        ReflectionTestUtils.setField(service, "jwtSecret", JWT_SECRET);
    }

    private Config config(boolean showRequirements, boolean showOwners, boolean showUnassigned) {
        Config cfg = new Config();
        cfg.setBoardLinkValidDays(30);
        cfg.setBoardShowRequirements(showRequirements);
        cfg.setBoardShowOwners(showOwners);
        cfg.setBoardShowUnassigned(showUnassigned);
        return cfg;
    }

    private void stubConfig(Config cfg) {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(cfg));
    }

    private void stubSnapshot(Snapshot snapshot) throws Exception {
        when(jdbc.queryForList(anyString(), eq(String.class), any(Object[].class)))
                .thenReturn(List.of(objectMapper.writeValueAsString(snapshot)));
    }

    private Snapshot snapshot() {
        Snapshot s = new Snapshot();
        s.setReportDate("2026-10-20");
        s.setReportType("morning");
        s.setReportTypeLabel("晨報");
        s.setScopeLabel("項目#1 / 全部迭代");
        Summary summary = new Summary();
        summary.setProjectCount(1);
        summary.setOverdueItemCount(2);
        s.setSummary(summary);

        RequirementNode req = new RequirementNode();
        req.setReqId(11L);
        req.setTitle("登錄改版");
        req.setReqNo("XQ202610001");
        req.setAssigneePmName("張三");
        req.setDetailUrl("/rdm-detail?id=11&mode=view");

        IterationNode it = new IterationNode();
        it.setIterationId(5L);
        it.setProjectId(1L);
        it.setCode("SP202610001");
        it.setName("十月迭代");
        it.setStatus("active");
        it.setOwnerName("李四");
        it.setRequirementCount(1);
        it.setRequirements(new java.util.ArrayList<>(List.of(req)));

        ProjectNode p = new ProjectNode();
        p.setProjectId(1L);
        p.setProjectNo("PROJ2026102001");
        p.setProjectName("門戶改版");
        p.setPmUserId(7L);
        p.setPmUserName("張三");
        p.setProductOwnerUserId(8L);
        p.setProductOwnerUserName("李四");
        p.setDeliveryItemTotal(4);
        p.setDeliveryItemCompleted(1);
        p.setRemainingCount(3);
        p.setOverdueFlag(1);
        p.setDetailUrl("/rdm-project-detail?id=1&mode=view");
        p.setIterations(new java.util.ArrayList<>(List.of(it)));

        RequirementNode unscheduled = new RequirementNode();
        unscheduled.setReqId(12L);
        unscheduled.setTitle("未排需求");
        unscheduled.setAssigneePmName("王五");
        unscheduled.setDetailUrl("/rdm-detail?id=12&mode=view");
        p.setUnscheduledRequirements(new java.util.ArrayList<>(List.of(unscheduled)));

        s.setProjects(new java.util.ArrayList<>(List.of(p)));
        s.setUnassignedIterations(new java.util.ArrayList<>());
        return s;
    }

    @Test
    @DisplayName("有效令牌：返回快照，且站内详情链接一律剔除")
    void returnsSnapshotAndStripsInternalLinks() throws Exception {
        stubConfig(config(true, true, true));
        stubSnapshot(snapshot());
        long now = System.currentTimeMillis();
        String token = RdmDailyReportViewTokenUtil.generate(DAY, "morning", 1L, null,
                now, now + 10L * 24 * 60 * 60 * 1000, SECRET);

        PublicView view = service.publicView(token);

        assertTrue(view.isValid());
        assertNotNull(view.getSnapshot());
        assertEquals(1, view.getSnapshot().getSummary().getProjectCount());
        ProjectNode p = view.getSnapshot().getProjects().get(0);
        assertNull(p.getDetailUrl(), "开放页不能带站内详情链接");
        assertEquals("張三", p.getPmUserName());
        assertNull(p.getIterations().get(0).getRequirements().get(0).getDetailUrl());
        assertEquals("張三", p.getIterations().get(0).getRequirements().get(0).getAssigneePmName());
    }

    @Test
    @DisplayName("展示参数关闭：需求明细与负责人字段被裁剪，但项目指标不变")
    void trimsContentByDisplayFlags() throws Exception {
        stubConfig(config(false, false, false));
        stubSnapshot(snapshot());
        long now = System.currentTimeMillis();
        String token = RdmDailyReportViewTokenUtil.generate(DAY, "morning", 1L, null,
                now, now + 10L * 24 * 60 * 60 * 1000, SECRET);

        PublicView view = service.publicView(token);

        assertTrue(view.isValid());
        assertFalse(view.isShowRequirements());
        assertFalse(view.isShowOwners());
        ProjectNode p = view.getSnapshot().getProjects().get(0);
        assertNull(p.getPmUserName());
        assertNull(p.getPmUserId());
        assertTrue(p.getIterations().get(0).getRequirements().isEmpty(), "关闭需求明細后不应返回需求行");
        assertTrue(p.getUnscheduledRequirements().isEmpty());
        assertEquals(4, p.getDeliveryItemTotal(), "展示裁剪不得改动进度指标");
    }

    @Test
    @DisplayName("过期令牌：签名正确也不出数据，统一提示不可用")
    void rejectsExpiredToken() {
        stubConfig(config(true, true, true));
        long issued = System.currentTimeMillis() - 40L * 24 * 60 * 60 * 1000;
        String token = RdmDailyReportViewTokenUtil.generate(DAY, "morning", 1L, null,
                issued, issued + 30L * 24 * 60 * 60 * 1000, SECRET);

        PublicView view = service.publicView(token);

        assertFalse(view.isValid());
        assertNotNull(view.getMessage());
        assertNull(view.getSnapshot());
    }

    @Test
    @DisplayName("篡改令牌：签名不匹配直接拒绝，不查快照")
    void rejectsForgedToken() {
        stubConfig(config(true, true, true));
        long now = System.currentTimeMillis();
        String valid = RdmDailyReportViewTokenUtil.generate(DAY, "morning", 1L, null,
                now, now + 24L * 60 * 60 * 1000, SECRET);
        String forged = valid.substring(0, valid.lastIndexOf('.') + 1) + "AAAA";

        PublicView view = service.publicView(forged);

        assertFalse(view.isValid());
        assertNull(view.getSnapshot());
    }
}
