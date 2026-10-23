package com.mftb.admin.config.migration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 结构契约校验器：在<b>每次启动</b>都运行（不受 {@code applyOnce} 门控），排在所有
 * 初始化器之后（{@code @Order} 最大值）。它直接解决“生产库迁移反复漏执行”问题：
 * <ol>
 *   <li>持有迁移命名锁，串行化多副本并发自愈。</li>
 *   <li>对 {@link ContractRegistry} 中的每个契约：表缺失则执行安全的 CREATE TABLE IF NOT EXISTS；
 *       必需列缺失则执行已登记的 ADD COLUMN。</li>
 *   <li>自愈后重新核验；残余漂移记入 not-ready 原因。</li>
 *   <li>全部满足 → 置就绪；否则记录 ERROR 并在 {@code schema.strict=true}（生产默认）时
 *       抛异常中止启动（配合 maxUnavailable:0，旧实例继续服务）。</li>
 * </ol>
 * 即使历史 {@code sys_schema_version} 已把某迁移记为成功，本校验仍会兜底保证关键结构存在。
 */
@Slf4j
@Component
@Order(Integer.MAX_VALUE)
@RequiredArgsConstructor
public class SchemaContractValidator implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final ContractRegistry contractRegistry;
    private final MigrationLock migrationLock;
    private final DatabaseReadinessState readinessState;
    /** 两路入口只允许真正执行一次（自愈 DDL 不能重放两次） */
    private final java.util.concurrent.atomic.AtomicBoolean executed = new java.util.concurrent.atomic.AtomicBoolean(false);

    /**
     * Bean 初始化即打一行：用于区分「Bean 没被创建」与「Bean 创建了但 Runner 没被执行」。
     * <p>这两类问题在日志上表现相同（只有 readiness=DOWN 而没有任何校验日志），
     * 但修复方向完全不同，必须可观测。
     */
    @jakarta.annotation.PostConstruct
    void announceBean() {
        log.warn("结构契约校验器已装配（等待 Runner 执行）");
    }

    /** 严格模式：存在无法自愈的漂移时中止启动。生产应设为 true（SCHEMA_STRICT=true）。 */
    @Value("${schema.strict:false}")
    private boolean strict;

    /** 只读校验模式：不执行任何自愈 DDL（供 schema-check CLI 使用，正常启动为 false）。 */
    @Value("${schema.check-only:false}")
    private boolean checkOnly;

    @Override
    public void run(String... args) {
        verifyAndMark("CommandLineRunner");
    }

    /**
     * 就绪事件兜底：本类曾出现「Bean 已装配（@PostConstruct 有日志）但 Runner 未被调用」——
     * 现象就是 readiness 永远 DOWN、但日志里一条校验记录都没有。
     * <p>两路都走同一个幂等入口，无论哪种机制生效都不会重复执行 DDL。
     * <p>代价：在这一路径下 strict=true 已无法中止启动（容器已就绪），
     * 生产靠 readiness 探针拦流量；strict 主要防“带着漂移的实例被当成健康”。
     */
    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void onReady() {
        verifyAndMark("ApplicationReadyEvent");
    }

    /** 幂等入口：两路入口共用；先到先执行，后到的直接返回 */
    private void verifyAndMark(String trigger) {
        if (!executed.compareAndSet(false, true)) {
            return;
        }
        List<ContractSpec> contracts = contractRegistry.allContracts();
        List<String> drift = new ArrayList<>();
        /*
         * 入口就打印一行：readiness 变 DOWN 时，运维第一件事是区分「校验跑挂」与「确实漂移」。
         * 历史上这两个分支的日志都只在末尾输出，一旦在校验中途被阻断（如命名锁超时），
         * 日志里就只有一条「DOWN」而没有任何线索。
         */
        log.warn("结构契约校验开始：契约 {} 个，checkOnly={}，trigger={}",
                contracts.size(), checkOnly, trigger);
        try {
            if (checkOnly) {
                drift.addAll(SchemaContractChecker.validateOnly(jdbcTemplate, contracts));
            } else {
                migrationLock.runExclusive(lockName(), 120, () -> drift.addAll(selfHealAndValidate(contracts)));
            }
        } catch (RuntimeException e) {
            log.error("结构契约校验阶段异常: {}", e.getMessage(), e);
            drift.add("校验执行异常: " + e.getMessage());
        }

        if (drift.isEmpty()) {
            readinessState.markReady();
            log.info("结构契约校验通过：{} 个关键结构全部就绪", contracts.size());
            return;
        }

        readinessState.markNotReady(drift);
        drift.forEach(d -> log.error("结构契约漂移: {}", d));
        if (strict) {
            throw new IllegalStateException("数据库结构未满足契约，严格模式中止启动。漂移项: " + drift);
        }
        log.warn("存在 {} 项结构漂移且非严格模式，readiness 将为 DOWN 直至修复", drift.size());
    }

    /** 在锁内：先自愈可修复项，再核验全部契约，返回残余漂移。 */
    private List<String> selfHealAndValidate(List<ContractSpec> contracts) {
        List<String> drift = new ArrayList<>();
        for (ContractSpec spec : contracts) {
            if (!tableExists(spec.table())) {
                if (spec.createTableIfMissing() != null && !spec.createTableIfMissing().isBlank()) {
                    log.warn("契约表 {} 缺失，执行自愈建表", spec.table());
                    jdbcTemplate.execute(spec.createTableIfMissing());
                } else {
                    drift.add("表缺失且无自愈定义: " + spec.table());
                    continue;
                }
            }
            for (ContractSpec.ColumnSpec col : spec.requiredColumns()) {
                if (!columnExists(spec.table(), col.column())) {
                    if (col.healable()) {
                        log.warn("列 {}.{} 缺失，执行自愈补列", spec.table(), col.column());
                        jdbcTemplate.execute(col.addColumnDdl());
                    } else {
                        drift.add("列缺失且无自愈定义: " + spec.table() + "." + col.column());
                    }
                }
            }
        }
        // 自愈后复核（确认 DDL 真的生效）
        return revalidate(contracts, drift);
    }

    /** 自愈后复核：确认 DDL 真正生效，并合并自愈前判定为不可修复的漂移。 */
    private List<String> revalidate(List<ContractSpec> contracts, List<String> alreadyDrift) {
        List<String> remaining = new ArrayList<>();
        for (ContractSpec spec : contracts) {
            if (!tableExists(spec.table())) {
                remaining.add("自愈后表仍缺失: " + spec.table());
                continue;
            }
            for (ContractSpec.ColumnSpec col : spec.requiredColumns()) {
                if (!columnExists(spec.table(), col.column())) {
                    remaining.add("自愈后列仍缺失: " + spec.table() + "." + col.column());
                }
            }
        }
        // 合并自愈前判定为不可修复的漂移
        remaining.addAll(alreadyDrift.stream().filter(d -> d.contains("无自愈定义")).toList());
        return remaining;
    }

    private boolean tableExists(String table) {
        return SchemaContractChecker.tableExists(jdbcTemplate, table);
    }

    private boolean columnExists(String table, String column) {
        return SchemaContractChecker.columnExists(jdbcTemplate, table, column);
    }

    private String lockName() {
        String schema = "unknown";
        try {
            String s = jdbcTemplate.queryForObject("SELECT DATABASE()", String.class);
            if (s != null) {
                schema = s;
            }
        } catch (Exception ignored) {
            // 取不到库名时用默认锁名，仍能保证同库实例互斥
        }
        return "mftb:schema:" + schema;
    }
}
