package com.mftb.admin.config.migration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * schema-check 只读模式：以 {@code --schema.check-only=true} 启动时，本 Runner 拥有最高优先级，
 * 在任何初始化器执行<b>之前</b>完成结构契约只读校验并退出，不建表、不补列、不写版本表、不启动定时任务。
 * <p>
 * 退出码：0 = 契约完全满足；2 = 存在漂移（CI/运维据此判定环境是否可安全发布）。
 * 用于发布前对目标环境做“免写”结构就绪验证。默认关闭，正常启动不受影响。
 */
@Slf4j
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@RequiredArgsConstructor
public class SchemaCheckRunner implements CommandLineRunner {

    private static final int EXIT_OK = 0;
    private static final int EXIT_DRIFT = 2;

    private final JdbcTemplate jdbcTemplate;
    private final ContractRegistry contractRegistry;

    @Value("${schema.check-only:false}")
    private boolean checkOnly;

    /** 注入以便成功路径优雅关闭上下文；用 ObjectProvider 风格避免强耦合，这里直接持有可空引用。 */
    private final org.springframework.context.ConfigurableApplicationContext applicationContext;

    @Override
    public void run(String... args) {
        if (!checkOnly) {
            return;
        }
        log.info("===== schema-check 只读模式启动（不执行任何写操作）=====");
        List<String> drift = SchemaContractChecker.validateOnly(jdbcTemplate, contractRegistry.allContracts());
        if (drift.isEmpty()) {
            log.info("schema-check 结果: PASS（所有契约结构就绪）");
        } else {
            log.error("schema-check 结果: FAIL，共 {} 项漂移:", drift.size());
            drift.forEach(d -> log.error("  - {}", d));
        }
        int code = drift.isEmpty() ? EXIT_OK : EXIT_DRIFT;
        log.info("===== schema-check 完成，退出码 {} =====", code);
        // 以独立一次性校验进程退出；先关闭上下文释放连接池
        int exitCode = org.springframework.boot.SpringApplication.exit(applicationContext, () -> code);
        System.exit(exitCode);
    }
}
