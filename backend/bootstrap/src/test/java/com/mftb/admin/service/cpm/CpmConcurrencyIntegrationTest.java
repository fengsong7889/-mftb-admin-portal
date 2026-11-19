/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntFunction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 持續績效并发与数据库兜底验收（真实 MySQL）。
 *
 * <p>为什么 Mockito 单测不够：{@code CpmWriteRulesTest} 里 Mapper 是假的，它只能证明
 * 「Java 侧看到 0 行会抛异常」，证明不了 MySQL 真的挡住了双写。本系统的三条地基都靠数据库约束：
 * <ul>
 *   <li>{@code UNIQUE(user_id, active_period, active_start)}：一人一期只有一份汇报，
 *       否则「同周期长出两份周报」会让统计与推送口径分裂；</li>
 *   <li>{@code UNIQUE(active_user, active_src_type, active_src_ref)}：同一个 RDM 需求
 *       重复导入只可能有一条；</li>
 *   <li>版本化 UPDATE：两端同时编辑只有一边赢，输的一方拿到「已被他人更新」而不是静默覆盖。</li>
 * </ul>
 * 这三条都是软删感知生成列，只有真实 MySQL 才会按生成列取值判等，H2/内存实现都测不出。
 *
 * <p>只在注入了 DB_URL 时运行（CI 无库时跳过）；夹具带唯一标记并在用例后物理清理，
 * 开发库是共享的，脏数据会污染别人的评审。直接调 Service 而非 HTTP：要验的是锁与约束，
 * 不是鉴权切面；用 SecurityContext 注入真实操作人即可，不为测试索取凭据。
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "DB_URL", matches = ".+",
        disabledReason = "需要真实 MySQL；CI 无库时跳过，避免把网络数据库依赖塞进流水线")
class CpmConcurrencyIntegrationTest {

    @Autowired
    private CpmItemService itemService;
    @Autowired
    private CpmReportService reportService;
    @Autowired
    private CpmTimeEntryService timeEntryService;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private SysUserMapper sysUserMapper;

    private Long operatorId;
    private String marker;
    private LocalDate weekStart;
    private final List<Long> itemIds = new ArrayList<>();

    @BeforeEach
    void seedOperator() {
        SysUser admin = sysUserMapper.selectById(1L);
        assertNotNull(admin, "开发库缺少 id=1 管理员，无法构造操作人");
        operatorId = admin.getId();
        marker = "CPM-CONC-" + System.currentTimeMillis() % 100000000L;
        LocalDate today = LocalDate.now();
        weekStart = today.minusDays(today.getDayOfWeek().getValue() - 1L);
        asUser();
    }

    @AfterEach
    void removeFixture() {
        // 先删流水再删条目，最后删汇报：留挂空行会污染下一轮统计口径
        if (!itemIds.isEmpty()) {
            String placeholders = String.join(",", itemIds.stream().map(x -> "?").toList());
            jdbc.update("DELETE FROM biz_cpm_item_update WHERE item_id IN (" + placeholders + ")", itemIds.toArray());
            // 阶段三：时段是条目的子事实，必须先于条目删除，否则 FK 会挡住整轮清理
            jdbc.update("DELETE FROM biz_cpm_time_entry WHERE item_id IN (" + placeholders + ")", itemIds.toArray());
            jdbc.update("DELETE FROM biz_cpm_comment WHERE target_type = 'item' AND target_id IN (" + placeholders + ")", itemIds.toArray());
            jdbc.update("DELETE FROM biz_cpm_recognition WHERE target_type = 'item' AND target_id IN (" + placeholders + ")", itemIds.toArray());
        }
        // 阶段三的两条外键是**互相指向**的：revision.report_id → report.id，而
        // report.published_revision_id → revision.id。有环就不存在"谁先删都行"的顺序 ——
        // 必须先把汇报上的版本指针置空断开这条环，再按「推送记录 → 版本行 → 汇报」删。
        // 顺序错一位就是 Cannot delete or update a parent row，而清理失败会静默留下版本行，
        // 下一轮 publish 复用同一汇报行时版本号继续往上长（实测 2→4→5），
        // 让并发幂等断言看起来像"幂等失效"——那是清理缺陷冒充业务缺陷，最难查的一类假红。
        // 范围只圈本期本人那几条汇报——不按 id 收口就会顺手删掉别人的取证链。
        List<Long> reportIds = jdbc.queryForList(
                "SELECT id FROM biz_cpm_report WHERE user_id = ? AND period_start = ?",
                Long.class, operatorId, weekStart);
        if (!reportIds.isEmpty()) {
            String ph = String.join(",", reportIds.stream().map(x -> "?").toList());
            Object[] args = reportIds.toArray();
            // 同一段 id 列表在这条 SQL 里出现两次，参数必须拼成一个扁平数组：
            // 写成 update(sql, args, args) 会把「Object[] 数组」当成一个绑定值送进去，
            // MySQL 报的是 Truncated incorrect DOUBLE value: '\xAC\xED\x00\x05ur…'（序列化后的 Java 数组字节码）
            Object[] twice = java.util.stream.Stream.of(args, args).flatMap(java.util.Arrays::stream).toArray();
            jdbc.update("UPDATE biz_cpm_report SET published_revision_id = NULL WHERE id IN (" + ph + ")", args);
            jdbc.update("DELETE FROM biz_cpm_push_record WHERE ref_id IN (" + ph + ") OR revision_id IN "
                    + "(SELECT id FROM biz_cpm_report_revision WHERE report_id IN (" + ph + "))", twice);
            jdbc.update("DELETE FROM biz_cpm_report_revision WHERE report_id IN (" + ph + ")", args);
            jdbc.update("DELETE FROM biz_cpm_report WHERE id IN (" + ph + ")", args);
        }
        jdbc.update("DELETE FROM biz_cpm_item WHERE user_id = ? AND title LIKE ?", operatorId, marker + "%");
        SecurityContextHolder.clearContext();
    }

    private CpmDto.ItemForm newItemForm(String titleSuffix, String sourceRef) {
        CpmDto.ItemForm form = new CpmDto.ItemForm();
        form.setTitle(marker + " " + titleSuffix);
        form.setStatus("doing");
        form.setProgress(10);
        form.setWorkDate(LocalDate.now().toString());
        form.setSourceType(sourceRef == null ? "manual" : "rdm_requirement");
        form.setSourceRef(sourceRef);
        return form;
    }

    private CpmDto.DraftForm draftForm() {
        CpmDto.DraftForm form = new CpmDto.DraftForm();
        form.setPeriodType(CpmConstants.PERIOD_WEEK);
        form.setPeriodStart(weekStart.toString());
        form.setSummary("并发验收摘要");
        form.setAiSummary(false);
        return form;
    }

    /* ==================== 1. 同周期并发发布 ==================== */

    @Test
    @DisplayName("同一人同一周并发发布：库里只有一份汇报，两端都拿到已发布视图")
    void concurrentPublishKeepsSingleReportRow() throws Exception {
        itemIds.add(itemService.create(newItemForm("汇报并发条目", null)).getId());

        List<String> outcomes = runConcurrently(2, index -> {
            try {
                asUser();
                CpmDto.ReportVO vo = reportService.publish(draftForm());
                return vo.getStatus();
            } catch (Exception e) {
                return "ERROR:" + throwableChain(e);
            }
        });

        outcomes.forEach(o -> assertEquals(CpmConstants.REPORT_STATUS_PUBLISHED, o, "并发发布不得出现失败分支: " + outcomes));
        Integer rows = jdbc.queryForObject("SELECT COUNT(*) FROM biz_cpm_report WHERE user_id = ? AND period_start = ?",
                Integer.class, operatorId, weekStart);
        assertEquals(1, rows, "UNIQUE(user_id,period,period_start) 没挡住双行，统计与推送口径会分裂");
        Integer published = jdbc.queryForObject(
                "SELECT COUNT(*) FROM biz_cpm_report WHERE user_id = ? AND period_start = ? AND status = 'published' AND published_at IS NOT NULL",
                Integer.class, operatorId, weekStart);
        assertEquals(1, published);
    }

    /* ==================== 2. 同一来源对象并发导入 ==================== */

    @Test
    @DisplayName("同一个 RDM 需求并发导入：唯一键只放行一条，另一条被翻成人话")
    void concurrentImportOfSameSourceKeepsSingleItem() throws Exception {
        String sourceRef = String.valueOf(9_000_000L + Math.abs(marker.hashCode()) % 1000);

        List<String> outcomes = runConcurrently(2, index -> {
            try {
                asUser();
                Long id = itemService.create(newItemForm("來源导入并发条目", sourceRef)).getId();
                itemIds.add(id);
                return "OK:" + id;
            } catch (BusinessException e) {
                return "REJECT:" + e.getMessage();
            } catch (Exception e) {
                return "ERROR:" + throwableChain(e);
            }
        });

        long accepted = outcomes.stream().filter(o -> o.startsWith("OK:")).count();
        long rejected = outcomes.stream().filter(o -> o.contains("已導入")).count();
        assertEquals(1, accepted, "并发导入必须只有一条成功: " + outcomes);
        assertEquals(1, rejected, "撞唯一键的那条要翻译成「該來源對象已導入過」而不是抛原始 SQL 异常: " + outcomes);
        Integer rows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM biz_cpm_item WHERE user_id = ? AND source_type = 'rdm_requirement' AND source_ref = ?",
                Integer.class, operatorId, sourceRef);
        assertEquals(1, rows);
    }

    /* ==================== 3. 同条目并发编辑（乐观锁） ==================== */

    @Test
    @DisplayName("两端带同一旧版本并发编辑：只有一个赢，输的一方拿到刷新提示而不是静默覆盖")
    void concurrentEditOnlyOneWins() throws Exception {
        Long itemId = itemService.create(newItemForm("乐观锁并发条目", null)).getId();
        itemIds.add(itemId);

        List<String> outcomes = runConcurrently(2, index -> {
            try {
                asUser();
                CpmDto.ItemForm form = newItemForm("乐观锁并发条目", null);
                form.setVersion(0);
                form.setStatus("doing");
                form.setProgress(30 + index);
                itemService.update(itemId, form);
                return "OK";
            } catch (BusinessException e) {
                return "REJECT:" + e.getMessage();
            } catch (Exception e) {
                return "ERROR:" + throwableChain(e);
            }
        });

        long ok = outcomes.stream().filter(o -> o.equals("OK")).count();
        long conflict = outcomes.stream().filter(o -> o.contains("已被他人更新")).count();
        assertEquals(1, ok, "两端同版本提交，恰好一个能赢: " + outcomes);
        assertEquals(1, conflict, "输的一方必须显式冲突，不能静默覆盖对方的编辑: " + outcomes);
        Integer version = jdbc.queryForObject("SELECT version FROM biz_cpm_item WHERE id = ?", Integer.class, itemId);
        assertEquals(1, version, "只允许一次成功写入把版本推到 1");
        assertTrue(outcomes.stream().noneMatch(o -> o.startsWith("ERROR:")), "并发不应冒出未收敛的异常: " + outcomes);
    }

    /* ==================== 4. 并发写投入时段（阶段三） ==================== */

    @Test
    @DisplayName("两端并发给同一条目记时段：两段都在，条目工时缓存是两段之和而不是双计")
    void concurrentSegmentsAreAllKeptAndCachedSumIsRight() throws Exception {
        Long itemId = itemService.create(newItemForm("时段并发条目", null)).getId();
        itemIds.add(itemId);

        List<String> outcomes = runConcurrently(2, index -> {
            try {
                asUser();
                CpmDto.TimeEntryForm form = new CpmDto.TimeEntryForm();
                form.setWorkDate(LocalDate.now().toString());
                form.setStartTime(index == 0 ? "09:00" : "14:00");
                form.setEndTime(index == 0 ? "10:00" : "15:30");
                timeEntryService.create(itemId, form);
                return "OK";
            } catch (Exception e) {
                return "ERROR:" + throwableChain(e);
            }
        });

        outcomes.forEach(o -> assertEquals("OK", o, "并发记时不应有失败分支: " + outcomes));
        // 时段之间没有唯一键（同日多段是刻意设计），所以两条都必须在——
        // 少了任何一条，日报与周报的工时就会静默偏低，而界面上完全看不出来
        Integer rows = jdbc.queryForObject("SELECT COUNT(*) FROM biz_cpm_time_entry WHERE item_id = ?",
                Integer.class, itemId);
        assertEquals(2, rows);
        Integer cachedHours = jdbc.queryForObject(
                "SELECT work_hours * 60 FROM biz_cpm_item WHERE id = ?", Integer.class, itemId);
        assertEquals(150, cachedHours, "60 + 90 分钟；双计或漏计都会让缓存与明细对不上");
        String source = jdbc.queryForObject("SELECT work_hours_source FROM biz_cpm_item WHERE id = ?",
                String.class, itemId);
        assertEquals("segment", source);
        Integer minutesInDb = jdbc.queryForObject(
                "SELECT SUM(duration_minutes) FROM biz_cpm_time_entry WHERE item_id = ?", Integer.class, itemId);
        assertEquals(cachedHours, minutesInDb, "条目缓存必须与时段明细自洽，否则界面两个数字会打架");
    }

    /* ==================== 5. 并发修订重发布（阶段三） ==================== */

    @Test
    @DisplayName("同一份修订并发提交两次：只长出一个新版本，重发端拿到同一版本而不是 V2/V3 并存")
    void concurrentRepublishProducesSingleNewRevision() throws Exception {
        Long itemId = itemService.create(newItemForm("修訂併發條目", null)).getId();
        itemIds.add(itemId);
        Long reportId = reportService.publish(draftForm()).getId();
        assertNotNull(reportId, "发布后应拿到汇报 id 才能测修订");

        // 修订前先制造一次真实变化，否则「内容与上次发布一致」会被正确地判为无需新版本
        CpmDto.TimeEntryForm segment = new CpmDto.TimeEntryForm();
        segment.setWorkDate(LocalDate.now().toString());
        segment.setDurationMinutes(45);
        timeEntryService.create(itemId, segment);

        List<String> outcomes = runConcurrently(2, index -> {
            try {
                asUser();
                CpmDto.RepublishForm form = new CpmDto.RepublishForm();
                form.setReportId(reportId);
                form.setChangeNote("并发修订同一说明");
                form.setSummary("并发验收摘要");
                form.setAiSummary(false);
                CpmDto.ReportVO vo = reportService.republish(form);
                return String.valueOf(vo.getRevisionNo());
            } catch (BusinessException e) {
                return "REJECT:" + e.getMessage();
            } catch (Exception e) {
                return "ERROR:" + throwableChain(e);
            }
        });

        Integer revisions = jdbc.queryForObject(
                "SELECT COUNT(*) FROM biz_cpm_report_revision WHERE report_id = ?", Integer.class, reportId);
        assertEquals(2, revisions, "首发 V1 + 同一说明的并发修订只能再加一版；长出 V3 就是幂等失效");
        Integer distinctNos = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT revision_no) FROM biz_cpm_report_revision WHERE report_id = ?",
                Integer.class, reportId);
        assertEquals(revisions, distinctNos, "版本号不得重复（uk_cpm_revision_no 是唯一裁判）");
        assertTrue(outcomes.stream().noneMatch(o -> o.startsWith("ERROR:")),
                "并发修订不应冒出未收敛的异常: " + outcomes);
    }

    /* ==================== 夹具辅助 ==================== */

    private void asUser() {
        SysUser admin = sysUserMapper.selectById(operatorId);
        assertNotNull(admin, "开发库缺少操作人记录");
        var auth = new UsernamePasswordAuthenticationToken(
                admin.getUsername(), null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        auth.setDetails(admin);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    /** 尽量让 N 个任务同时起跑（栅栏对齐），否则「并发」退化成顺序执行而测不出锁。 */
    private List<String> runConcurrently(int n, IntFunction<String> task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch ready = new CountDownLatch(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<String>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < n; i++) {
                final int index = i;
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await(30, TimeUnit.SECONDS);
                    return task.apply(index);
                }));
            }
            ready.await(30, TimeUnit.SECONDS);
            go.countDown();
            List<String> out = new ArrayList<>();
            for (Future<String> f : futures) {
                out.add(f.get(60, TimeUnit.SECONDS));
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    private static String throwableChain(Throwable e) {
        StringBuilder sb = new StringBuilder();
        for (Throwable t = e; t != null; t = t.getCause()) {
            sb.append(t.getClass().getSimpleName()).append(": ").append(t.getMessage()).append(' ');
        }
        return sb.toString();
    }
}