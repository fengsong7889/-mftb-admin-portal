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
            jdbc.update("DELETE FROM biz_cpm_comment WHERE target_type = 'item' AND target_id IN (" + placeholders + ")", itemIds.toArray());
            jdbc.update("DELETE FROM biz_cpm_recognition WHERE target_type = 'item' AND target_id IN (" + placeholders + ")", itemIds.toArray());
        }
        jdbc.update("DELETE FROM biz_cpm_item WHERE user_id = ? AND title LIKE ?", operatorId, marker + "%");
        jdbc.update("DELETE FROM biz_cpm_report WHERE user_id = ? AND period_start = ?", operatorId, weekStart);
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