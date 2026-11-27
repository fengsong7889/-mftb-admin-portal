/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.MybatisSqlSessionFactoryBuilder;
import org.apache.ibatis.datasource.unpooled.UnpooledDataSource;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** 容量窗口与快照边界的真实 SQL 回归：H2 MySQL 模式，不依赖远程开发库。 */
class CpmWorklogCapacityMapperTest {

    private SqlSession session;
    private CpmItemMapper itemMapper;
    private CpmItemUpdateMapper updateMapper;

    @BeforeEach
    void setUp() throws Exception {
        UnpooledDataSource ds = new UnpooledDataSource("org.h2.Driver",
                "jdbc:h2:mem:cpm_capacity_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1", "sa", "");
        MybatisConfiguration cfg = new MybatisConfiguration();
        cfg.setMapUnderscoreToCamelCase(true);
        cfg.setEnvironment(new Environment("test", new JdbcTransactionFactory(), ds));
        cfg.addMapper(CpmItemMapper.class);
        cfg.addMapper(CpmItemUpdateMapper.class);
        session = new MybatisSqlSessionFactoryBuilder().build(cfg).openSession(true);
        itemMapper = session.getMapper(CpmItemMapper.class);
        updateMapper = session.getMapper(CpmItemUpdateMapper.class);
        try (var st = session.getConnection().createStatement()) {
            st.execute("""
                    CREATE TABLE biz_cpm_item (
                      id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL, deleted TINYINT NOT NULL DEFAULT 0,
                      title VARCHAR(200), status VARCHAR(16), progress INT, updated_at DATE,
                      plan_start DATE, plan_end DATE, work_date DATE, note_text TEXT,
                      plan_type VARCHAR(16), follow_up TINYINT, group_id BIGINT
                    )
                    """);
            st.execute("""
                    CREATE TABLE biz_cpm_item_update (
                      id BIGINT PRIMARY KEY, item_id BIGINT NOT NULL, update_date DATE NOT NULL,
                      progress INT, status VARCHAR(16), note VARCHAR(500), created_by VARCHAR(64), created_at TIMESTAMP
                    )
                    """);
        }
    }

    @AfterEach
    void tearDown() {
        if (session != null) session.close();
    }

    @Test
    @DisplayName("默认全部档保留活动任务与近 12 个月关闭任务，排除更早完成记录")
    void defaultWindowKeepsActiveAndRecentClosedOnly() {
        LocalDate windowStart = LocalDate.of(2025, 11, 27);
        insertItem(1L, 7L, "doing", 50, LocalDate.of(2024, 1, 1), LocalDate.of(2024, 1, 2));
        insertItem(2L, 7L, "done", 100, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 10, 1));
        insertItem(3L, 7L, "done", 100, LocalDate.of(2024, 1, 1), LocalDate.of(2023, 12, 1));
        insertItem(4L, 7L, "cancelled", 50, LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 10));

        List<Long> ids = itemMapper.listLedgerWindow(7L, windowStart, null, null,
                null, null, null, null, 100).stream().map(item -> item.getId()).toList();

        assertThat(ids).containsExactlyInAnyOrder(1L, 2L, 4L);
        assertThat(itemMapper.countLedgerWindow(7L, windowStart, null, null,
                null, null, null, null)).isEqualTo(3);
        assertThat(itemMapper.listLedgerArchive(7L, windowStart, null, null,
                null, null, null, null, 100).stream().map(item -> item.getId()).toList())
                .containsExactly(3L);
        assertThat(itemMapper.countLedgerArchive(7L, windowStart, null,
                null, null, null)).isEqualTo(1);
    }

    @Test
    @DisplayName("显式历史区间不再叠加默认 12 个月窗口，老完成记录按排期相交返回")
    void explicitHistoricalRangeDoesNotApplyDefaultWindow() {
        LocalDate from = LocalDate.of(2024, 1, 1);
        LocalDate to = LocalDate.of(2024, 1, 31);
        insertItem(1L, 7L, "done", 100, LocalDate.of(2024, 1, 1), LocalDate.of(2024, 1, 10));
        insertItem(2L, 7L, "done", 100, LocalDate.of(2024, 2, 1), LocalDate.of(2024, 2, 2));

        List<Long> ids = itemMapper.listLedgerWindow(7L, LocalDate.of(2025, 11, 27), from, to,
                null, null, null, null, 100).stream().map(item -> item.getId()).toList();

        assertThat(ids).containsExactly(1L);
        assertThat(itemMapper.countLedgerWindow(7L, LocalDate.of(2025, 11, 27), from, to,
                null, null, null, null)).isEqualTo(1);
    }

    @Test
    @DisplayName("归档游标按日期 + id 续读，不重复也不遗漏")
    void archiveCursorDoesNotRepeatOrSkipRows() {
        LocalDate windowStart = LocalDate.of(2025, 11, 27);
        LocalDate date = LocalDate.of(2025, 1, 1);
        insertItem(1L, 7L, "done", 100, LocalDate.of(2024, 1, 1), date);
        insertItem(2L, 7L, "done", 100, LocalDate.of(2024, 1, 1), date);
        insertItem(3L, 7L, "done", 100, LocalDate.of(2024, 1, 1), date);

        var first = itemMapper.listLedgerArchive(7L, windowStart, null, null,
                null, null, null, null, 2);
        var second = itemMapper.listLedgerArchive(7L, windowStart, date, first.get(1).getId(),
                null, null, null, null, 2);

        assertThat(first).extracting(item -> item.getId()).containsExactly(3L, 2L);
        assertThat(second).extracting(item -> item.getId()).containsExactly(1L);
    }

    @Test
    @DisplayName("快照边界查询只返回本人载入任务，且同日取 id 最大的一笔")
    void snapshotBoundaryRespectsOwnershipAndSameDayTieBreak() {
        insertItem(1L, 7L, "doing", 80, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 25));
        insertItem(2L, 8L, "doing", 90, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 25));
        insertUpdate(10L, 1L, LocalDate.of(2026, 11, 1), 20);
        insertUpdate(11L, 1L, LocalDate.of(2026, 11, 20), 60);
        insertUpdate(12L, 1L, LocalDate.of(2026, 11, 20), 70);
        insertUpdate(13L, 1L, LocalDate.of(2026, 11, 25), 80);
        insertUpdate(14L, 2L, LocalDate.of(2026, 11, 25), 90);

        var latest = updateMapper.listLatestPerItem(7L, List.of(1L), null);
        var atBoundary = updateMapper.listLatestPerItem(7L, List.of(1L), LocalDate.of(2026, 11, 20));

        assertThat(latest).singleElement().satisfies(row -> {
            assertThat(row.getId()).isEqualTo(13L);
            assertThat(row.getProgress()).isEqualTo(80);
        });
        assertThat(atBoundary).singleElement().satisfies(row -> {
            assertThat(row.getId()).isEqualTo(12L);
            assertThat(row.getProgress()).isEqualTo(70);
        });
    }

    private void insertItem(long id, long userId, String status, int progress,
                            LocalDate updatedAt, LocalDate planStart) {
        var sql = """
                INSERT INTO biz_cpm_item
                  (id,user_id,deleted,title,status,progress,updated_at,plan_start,plan_end,work_date,plan_type,follow_up)
                VALUES (?,?,0,?,?,?,?,?,?,?, 'planned',0)
                """;
        try (var ps = session.getConnection().prepareStatement(sql)) {
            ps.setLong(1, id);
            ps.setLong(2, userId);
            ps.setString(3, "item-" + id);
            ps.setString(4, status);
            ps.setInt(5, progress);
            ps.setDate(6, java.sql.Date.valueOf(updatedAt));
            ps.setDate(7, java.sql.Date.valueOf(planStart));
            ps.setDate(8, java.sql.Date.valueOf(planStart));
            ps.setDate(9, java.sql.Date.valueOf(planStart));
            ps.executeUpdate();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private void insertUpdate(long id, long itemId, LocalDate date, int progress) {
        try (var ps = session.getConnection().prepareStatement(
                "INSERT INTO biz_cpm_item_update (id,item_id,update_date,progress,status) VALUES (?,?,?,?,'doing')")) {
            ps.setLong(1, id);
            ps.setLong(2, itemId);
            ps.setDate(3, java.sql.Date.valueOf(date));
            ps.setInt(4, progress);
            ps.executeUpdate();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
