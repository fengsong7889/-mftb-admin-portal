package com.mftb.admin.config;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * RDM 效能量日快照任务（M4）。
 * <p>两个触发点：每日凌晨定时跑（默认 02:30），以及首次启动时回填近 90 天，
 * 让趋势页一上线就有曲线可看。多副本由 MySQL 命名锁 {@code rdm_metric_snapshot} 串行化。
 *
 * <p><b>口径边界（重要）</b>：只有"事实时间戳可回算"的指标才回填：
 * 提交/受理/上线/响应时长/交付周期/按时率/驳回率/一次通过率/返工/变更。
 * 而「当日逾期存量」依赖处理过程中的 {@code overdue_flag} 当前值，历史某天的标记无法复原
 * （SLA 扫描只写当前状态），因此历史日期该列写 NULL 而不是拿今天的数字冒充，
 * 看板遇到 NULL 时按"未快照"处理。
 */
@Slf4j
@Component
@Order(26)
@RequiredArgsConstructor
public class RdmMetricSnapshotInitializer implements CommandLineRunner {

    /** 命名锁键（与迁移锁、SLA 扫描锁分离，互不阻塞） */
    private static final String LOCK_KEY = "rdm_metric_snapshot";

    /** 首次启动回填天数 */
    private static final int BACKFILL_DAYS = 90;

    /** 手工重算的单次上限（天）：口径修复后需要能把历史刷回来，但不能一次报十年 */
    private static final int RECOMPUTE_MAX_DAYS = 180;

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        runWithLock(() -> {
            if (snapshotCount() > 0) {
                return;
            }
            log.info("RDM 效能量快照為空，開始回填近 {} 天", BACKFILL_DAYS);
            for (int i = BACKFILL_DAYS; i >= 1; i--) {
                snapshotDay(LocalDate.now().minusDays(i));
            }
            log.info("RDM 效能量快照回填完成: 行數={}", snapshotCount());
        });
    }

    /** 每日凌晨快照昨天与今天（跨零点补一次昨天，避免 23:59 的数据丢失） */
    @Scheduled(cron = "${rdm.metric.snapshot-cron:0 30 2 * * ?}")
    public void dailySnapshot() {
        runWithLock(() -> {
            LocalDate today = LocalDate.now();
            snapshotDay(today.minusDays(1));
            snapshotDay(today);
            log.info("RDM 效能量日快照已更新: date={}, 行數={}", today, snapshotCount());
        });
    }

    /** 命名锁保护下执行（多副本只让一个实例写） */
    private void runWithLock(Runnable task) {
        Integer locked = jdbcTemplate.queryForObject("SELECT GET_LOCK(?, 0)", Integer.class, LOCK_KEY);
        if (locked == null || locked != 1) {
            log.debug("RDM 效能量快照跳過：其它實例持有命名鎖");
            return;
        }
        try {
            task.run();
        } catch (Exception e) {
            // 定时任务失败不能打断调度线程；下一轮自动重试
            log.error("RDM 效能量快照失敗: {}", e.getMessage(), e);
        } finally {
            jdbcTemplate.queryForObject("SELECT RELEASE_LOCK(?)", Integer.class, LOCK_KEY);
        }
    }

    /** 某一天 × 三个维度写快照（幂等 upsert） */
    public void snapshotDay(LocalDate day) {
        upsert(RdmConstants.DIM_COMPANY, null, null, day);
        for (Map<String, Object> dept : jdbcTemplate.queryForList(
                "SELECT DISTINCT submit_dept_id AS id, submit_dept_name AS name FROM rdm_requirement "
                        + "WHERE deleted = 0 AND submit_dept_id IS NOT NULL")) {
            upsert(RdmConstants.DIM_DEPT, asLong(dept.get("id")), (String) dept.get("name"), day);
        }
        for (Map<String, Object> pm : jdbcTemplate.queryForList(
                "SELECT DISTINCT assignee_pm_user_id AS id, assignee_pm_name AS name FROM rdm_requirement "
                        + "WHERE deleted = 0 AND assignee_pm_user_id IS NOT NULL")) {
            upsert(RdmConstants.DIM_PM, asLong(pm.get("id")), (String) pm.get("name"), day);
        }
    }

    /** 单个维度某天的快照写入 */
    private void upsert(String dimType, Long dimId, String dimName, LocalDate day) {
        // COMPANY 是全局维度，不存在归属对象。两个易错点（都踩过）：
        // 1) dim_id 必须落 0 而不是 NULL：MySQL 唯一索引不约束 NULL，存 NULL 会让回填重复跑长重复行；
        // 2) 归属条件必须用占位符：把 dimId 拼进 SQL 不仅违反规范，还会让参数个数与 ? 数不一致
        //    （历史缺陷：change_count 查询在 DEPT/PM 维度多传一个参数，部门与 PM 快照整体失败）。
        boolean global = RdmConstants.DIM_COMPANY.equals(dimType);
        Long storedDimId = global ? RdmConstants.COMPANY_DIM_ID : dimId;
        String scope = global ? "" : " AND " + scopeColumn(dimType) + " = ?";

        List<Object> args = new ArrayList<>();
        StringBuilder select = new StringBuilder("SELECT ");
        // 注：MySQL 的 TIMESTAMP(x, INTERVAL n DAY) 是语法错误（1064），必须用 DATE_ADD
        select.append("SUM(CASE WHEN submit_time < DATE_ADD(?, INTERVAL 1 DAY) THEN 1 ELSE 0 END) AS req_total, ");
        args.add(day);
        select.append("SUM(CASE WHEN DATE(submit_time) = ? THEN 1 ELSE 0 END) AS submitted, ");
        args.add(day);
        select.append("SUM(CASE WHEN DATE(accept_time) = ? THEN 1 ELSE 0 END) AS accepted, ");
        args.add(day);
        select.append("SUM(CASE WHEN actual_release_date = ? THEN 1 ELSE 0 END) AS released, ");
        args.add(day);
        /*
         * overdue 定为「当日逾期存量」而不是「当日上线且被标为逾期」：
         * overdue_flag 会在每次状态流转时被清零（transitionInternal 统一 setOverdueFlag(0)），
         * 拿它算历史某天的存量必然失真。存量用计划上线日与实际上线日回算，事实时间可重放。
         */
        select.append("SUM(CASE WHEN plan_release_date IS NOT NULL AND plan_release_date < ? "
                + "AND (actual_release_date IS NULL OR actual_release_date > ?) THEN 1 ELSE 0 END) AS overdue, ");
        args.add(day);
        args.add(day);
        select.append("AVG(CASE WHEN DATE(submit_time) = ? AND accept_time IS NOT NULL AND submitter_user_id IS NOT NULL "
                + "     THEN TIMESTAMPDIFF(HOUR, submit_time, accept_time) END) AS avg_response_hours, ");
        args.add(day);
        select.append("AVG(CASE WHEN actual_release_date = ? AND accept_time IS NOT NULL "
                + "     THEN (CASE WHEN actual_release_date >= DATE(accept_time) THEN DATEDIFF(actual_release_date, DATE(accept_time)) END) END) AS avg_delivery_days, ");
        args.add(day);
        select.append("AVG(CASE WHEN actual_release_date = ? THEN "
                + "     CASE WHEN plan_release_date IS NULL THEN NULL WHEN actual_release_date <= plan_release_date THEN 1 ELSE 0 END END) AS on_time_rate, ");
        args.add(day);
        select.append("AVG(CASE WHEN DATE(submit_time) = ? THEN CASE WHEN reject_count > 0 THEN 1 ELSE 0 END END) AS reject_rate, ");
        args.add(day);
        select.append("SUM(CASE WHEN DATE(accept_time) = ? THEN COALESCE(rework_count, 0) ELSE 0 END) AS rework_count ");
        args.add(day);
        select.append("FROM rdm_requirement WHERE deleted = 0").append(scope);
        if (!global) {
            args.add(dimId);
        }
        Map<String, Object> row = jdbcTemplate.queryForList(requireArgCount(select.toString(), args.toArray()), args.toArray())
                .stream().findFirst().orElse(Map.of());

        // 一次通过率来自验收记录（事实表），可安全回算；COMPANY 维度不加归属条件
        StringBuilder fpSql = new StringBuilder(
                "SELECT CASE WHEN COUNT(*) = 0 THEN NULL "
                        + "ELSE SUM(CASE WHEN t.fail_cnt = 0 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) END "
                        + "FROM (SELECT a.req_id, SUM(CASE WHEN a.result = 'fail' THEN 1 ELSE 0 END) AS fail_cnt "
                        + "      FROM rdm_acceptance a JOIN rdm_requirement r ON r.id = a.req_id AND r.deleted = 0 "
                        + "      WHERE a.deleted = 0 AND DATE(a.accept_time) = ?");
        List<Object> fpArgs = new ArrayList<>();
        fpArgs.add(day);
        if (!global) {
            fpSql.append(" AND r.").append(scopeColumn(dimType)).append(" = ?");
            fpArgs.add(dimId);
        }
        fpSql.append(" GROUP BY a.req_id) t");
        Double firstPass = jdbcTemplate.queryForObject(
                requireArgCount(fpSql.toString(), fpArgs.toArray()), Double.class, fpArgs.toArray());

        // 变更数同样按维度归属：参数列表与占位符个数逐条对齐，不再拼 dimId
        List<Object> changeArgs = new ArrayList<>();
        changeArgs.add(day);
        if (!global) {
            changeArgs.add(dimId);
        }
        String changeSql = requireArgCount(
                "SELECT COUNT(*) FROM rdm_change_request c JOIN rdm_requirement r ON r.id = c.req_id AND r.deleted = 0 "
                        + "WHERE c.deleted = 0 AND DATE(c.created_at) = ?" + scope, changeArgs.toArray());
        Integer changes = jdbcTemplate.queryForObject(changeSql, Integer.class, changeArgs.toArray());

        String insertSql = requireArgCount(
                "INSERT INTO rdm_metric_snapshot (stat_date, dim_type, dim_id, dim_name, req_total, submitted, accepted, "
                        + "released, overdue, avg_response_hours, avg_delivery_days, on_time_rate, reject_rate, "
                        + "first_pass_rate, rework_count, change_count, created_by, updated_by, deleted) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0) "
                        + "ON DUPLICATE KEY UPDATE req_total = VALUES(req_total), submitted = VALUES(submitted), "
                        + "accepted = VALUES(accepted), released = VALUES(released), overdue = VALUES(overdue), "
                        + "avg_response_hours = VALUES(avg_response_hours), avg_delivery_days = VALUES(avg_delivery_days), "
                        + "on_time_rate = VALUES(on_time_rate), reject_rate = VALUES(reject_rate), "
                        + "first_pass_rate = VALUES(first_pass_rate), rework_count = VALUES(rework_count), "
                        + "change_count = VALUES(change_count), updated_by = VALUES(updated_by), deleted = 0",
                new Object[]{day, dimType, storedDimId, dimName,
                        intOf(row.get("req_total")), intOf(row.get("submitted")), intOf(row.get("accepted")),
                        intOf(row.get("released")), intOf(row.get("overdue")),
                        row.get("avg_response_hours"), row.get("avg_delivery_days"),
                        row.get("on_time_rate"), row.get("reject_rate"), firstPass,
                        intOf(row.get("rework_count")), changes == null ? 0 : changes,
                        "system", "system"});
        jdbcTemplate.update(insertSql, day, dimType, storedDimId, dimName,
                intOf(row.get("req_total")), intOf(row.get("submitted")), intOf(row.get("accepted")),
                intOf(row.get("released")), intOf(row.get("overdue")),
                row.get("avg_response_hours"), row.get("avg_delivery_days"),
                row.get("on_time_rate"), row.get("reject_rate"), firstPass,
                intOf(row.get("rework_count")), changes == null ? 0 : changes,
                "system", "system");
    }

    /** 维度对应的归属列 */
    private static String scopeColumn(String dimType) {
        return switch (dimType) {
            case RdmConstants.DIM_DEPT -> "submit_dept_id";
            case RdmConstants.DIM_PM -> "assignee_pm_user_id";
            default -> "1";
        };
    }

    /**
     * 占位符与参数个数必须一致。
     * <p>历史缺陷正是把 dimId 拼进 SQL 后仍按「带占位符」传参，DEPT/PM 维度快照整体失败，
     * 对外只表现为「部门看板没数据」。宁可在写之前抛出，也不要静默少算一个维度。
     */
    static String requireArgCount(String sql, Object[] args) {
        long marks = sql.chars().filter(c -> c == '?').count();
        int given = args == null ? 0 : args.length;
        if (marks != given) {
            throw new IllegalStateException("快照 SQL 占位符 " + marks + " 個但傳了 " + given
                    + " 個參數，帰属維度会整体失败：" + sql.substring(0, Math.min(120, sql.length())));
        }
        return sql;
    }

    private long snapshotCount() {
        Long count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM rdm_metric_snapshot WHERE deleted = 0", Long.class);
        return count == null ? 0 : count;
    }

    private static Long asLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    /**
     * 手工重算指定区间的快照（口径变更后刷历史用）。
     * <p>只给管理岗开的运维入口：快照是看板与绩效建议的数据源，谁都能改等于口径可以被静默改写。
     */
    public int recompute(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new BusinessException("請選擇重算的起止日期");
        }
        if (from.isAfter(to)) {
            throw new BusinessException("開始日期不能晚於結束日期");
        }
        if (from.plusDays(RECOMPUTE_MAX_DAYS).isBefore(to)) {
            throw new BusinessException("單次重算最多覆蓋 " + RECOMPUTE_MAX_DAYS + " 天");
        }
        final int[] touched = {0};
        runWithLock(() -> {
            for (LocalDate cursor = from; !cursor.isAfter(to); cursor = cursor.plusDays(1)) {
                snapshotDay(cursor);
                touched[0]++;
            }
            log.info("RDM 效能量快照已重算: {} 至 {}，共 {} 天", from, to, touched[0]);
        });
        return touched[0];
    }

    private static int intOf(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }

    /** 供接口层复用的维度列表（前端下拉与快照实际覆盖范围保持一致，不给选了就空的选择） */
    public List<String> supportedDims() {
        return List.of(RdmConstants.DIM_COMPANY, RdmConstants.DIM_DEPT, RdmConstants.DIM_PM);
    }
}
