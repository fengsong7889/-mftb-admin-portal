package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 「重新入職」单据类型的流程种子（方案 §6.1：人事类流程是流程中心里的分类，不新增侧边栏菜单）。
 * <p>
 * 只做一件事：给 {@code biz_oa_process} 补 {@code hr_rehire} 流程定义。单据表无需加列
 * （复职沿用调动那套 new_dept_id / new_position_id / effective_date），
 * 授权也不新增动作 —— 它锚在既有的 {@code hr-onboarding} 菜单上。
 * <p>
 * 为什么仍要单独一个 versionKey：流程定义是审批链的锚点，缺它时提交单据会在
 * {@code OaRequestService.submit} 报「流程不存在」，而只改代码常量不会落到存量库。
 * 种子挂 {@code oa_general} 通用审批节点，实际审批人由「流程配置」编排，不在代码里硬编码姓名。
 * <p>
 * 参考 SQL: {@code backend/sql/252_hr_rehire_process.sql}。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@Order(35)
public class HrRehireProcessInitializer implements CommandLineRunner {

    static final String VERSION_KEY = "hr:rehire-process:v1.0";

    private static final String PROCESS_CODE = "hr_rehire";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            log.error("重新入职流程种子失败: {}", e.getMessage(), e);
            throw e;
        }
    }

    private void migrate() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO biz_oa_process "
                        + "(process_code, process_name, category, icon, description, workflow_type, sort_order, status) "
                        + "VALUES (?, ?, 'hr', 'LoginOutlined', ?, 'oa_general', 16, 1)",
                PROCESS_CODE, "重新入職", "離職員工返聘複職審批流程，通過後復用原賬號、開啟新一段僱傭並要求首次登錄改密");
        log.info("{} 流程定义种子完成: 新插入 {} 条", PROCESS_CODE, inserted);
    }

    private void verify() {
        Integer ready = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code = ? AND status = 1",
                Integer.class, PROCESS_CODE);
        if (ready == null || ready == 0) {
            throw new IllegalStateException(PROCESS_CODE + " 流程定义未就绪，重新入职单据将无法提交审批");
        }
    }
}
