package com.mftb.admin.config;

import com.mftb.admin.constant.HrLifecycleConstants;
import com.mftb.admin.util.BizSeqService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * HR 入转调离生命周期初始化器：建 hr_lifecycle_request 表 + OA 流程定义种子 + 单据编号规则种子。
 * <p>
 * 遵循迁移治理：{@code applyOnce(versionKey, task, verify)} —— 建表/种子与后置校验都成功才记录版本，
 * 失败不吞异常（applyOnce 写失败审计后下次启动重试）。表结构同时登记 {@code ContractRegistry}
 * 契约保证启动自愈。参考 SQL: backend/sql/195_hr_lifecycle.sql
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HrLifecycleSchemaInitializer implements CommandLineRunner {

    private static final String VERSION_KEY = "hr:lifecycle-schema:v1.0";

    /** 与 195_hr_lifecycle.sql / ContractRegistry.hrLifecycleRequestContract 保持同构 */
    private static final String CREATE_TABLE_SQL =
            "CREATE TABLE IF NOT EXISTS hr_lifecycle_request ("
                    + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID', "
                    + "req_no VARCHAR(32) NOT NULL COMMENT '单据编号(RS+YYYYMMDD+4位序号)', "
                    + "type VARCHAR(16) NOT NULL COMMENT '单据类型: onboard/regular/transfer/dimission', "
                    + "status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT '单据状态: draft/pending/approved/rejected/completed', "
                    + "flow_no VARCHAR(64) DEFAULT NULL COMMENT '关联OA流程编号', "
                    + "user_id BIGINT DEFAULT NULL COMMENT '关联 sys_user.id(入职完成后回填)', "
                    + "emp_name VARCHAR(64) NOT NULL COMMENT '姓名/候选人姓名', "
                    + "emp_no VARCHAR(32) DEFAULT NULL COMMENT '员工工号(入职完成后回填)', "
                    + "dept_id BIGINT DEFAULT NULL COMMENT '目标部门ID', "
                    + "dept_name VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照', "
                    + "position_id BIGINT DEFAULT NULL COMMENT '职位ID', "
                    + "position_name VARCHAR(128) DEFAULT NULL COMMENT '职位名称快照', "
                    + "effective_date DATE DEFAULT NULL COMMENT '生效日期', "
                    + "reason VARCHAR(512) DEFAULT NULL COMMENT '申请事由', "
                    + "offer_date DATE DEFAULT NULL COMMENT 'Offer发放日期', "
                    + "probation_months INT DEFAULT NULL COMMENT '试用期月数', "
                    + "expected_regular_date DATE DEFAULT NULL COMMENT '预计转正日期', "
                    + "id_card_no VARCHAR(64) DEFAULT NULL COMMENT '证件号码', "
                    + "mobile VARCHAR(32) DEFAULT NULL COMMENT '手机号', "
                    + "email VARCHAR(128) DEFAULT NULL COMMENT '邮箱', "
                    + "candidate_info JSON DEFAULT NULL COMMENT '入职资料JSON', "
                    + "old_dept_name VARCHAR(128) DEFAULT NULL COMMENT '调动前部门快照', "
                    + "old_position_name VARCHAR(128) DEFAULT NULL COMMENT '调动前职位快照', "
                    + "new_dept_id BIGINT DEFAULT NULL COMMENT '调入部门ID', "
                    + "new_dept_name VARCHAR(128) DEFAULT NULL COMMENT '调入部门名称快照', "
                    + "new_position_id BIGINT DEFAULT NULL COMMENT '调入职位ID', "
                    + "new_position_name VARCHAR(128) DEFAULT NULL COMMENT '调入职位名称快照', "
                    + "new_company VARCHAR(128) DEFAULT NULL COMMENT '调动后任职公司', "
                    + "new_superior VARCHAR(64) DEFAULT NULL COMMENT '调动后直属上级', "
                    + "dimission_type VARCHAR(32) DEFAULT NULL COMMENT '离职类型: voluntary/involuntary/expired', "
                    + "last_work_date DATE DEFAULT NULL COMMENT '最后工作日', "
                    + "settlement_info JSON DEFAULT NULL COMMENT '离职结算JSON', "
                    + "remark VARCHAR(512) DEFAULT NULL COMMENT '备注/办理结果说明', "
                    // 合同續簽单据字段（列扩展由 HrLifecycleRenewSchemaInitializer 对存量库补齐）
                    + "contract_id BIGINT DEFAULT NULL COMMENT '被续签的原合同ID(emp_contract.id)', "
                    + "contract_no VARCHAR(64) DEFAULT NULL COMMENT '原合同编号快照', "
                    + "new_contract_no VARCHAR(64) DEFAULT NULL COMMENT '新合同编号', "
                    + "new_contract_type VARCHAR(32) DEFAULT NULL COMMENT '新合同类型(HR字典 CONTRACT_TYPE)', "
                    + "new_contract_company VARCHAR(128) DEFAULT NULL COMMENT '新合同签约主体(HR字典 EMPLOYER_COMPANY)', "
                    + "new_contract_start_date DATE DEFAULT NULL COMMENT '新合同开始日期', "
                    + "new_contract_end_date DATE DEFAULT NULL COMMENT '新合同结束日期', "
                    + "created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人', "
                    + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                    + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                    + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                    + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                    + "UNIQUE KEY uk_hlr_req_no (req_no), "
                    + "KEY idx_hlr_type_status (type, status), "
                    + "KEY idx_hlr_user (user_id), "
                    + "KEY idx_hlr_flow_no (flow_no), "
                    + "KEY idx_hlr_emp_no (emp_no)"
                    + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR入转调离生命周期单据'";

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    @Override
    public void run(String... args) {
        try {
            versionTracker.applyOnce(VERSION_KEY, this::migrate, this::verify);
        } catch (Exception e) {
            // applyOnce 内部已写失败审计且不记版本；此处仅避免阻塞本地启动，下次启动会重试
            log.error("HR入轉調離建表/種子失敗: {}", e.getMessage(), e);
        }
    }

    private void migrate() {
        jdbcTemplate.execute(CREATE_TABLE_SQL);
        seedOaProcesses();
        seedSeqRule();
    }

    /** OA 流程定义种子：四类 HR 流程默认挂 oa_general 通用审批节点，可在「流程配置」单独编排 */
    private void seedOaProcesses() {
        String sql = "INSERT IGNORE INTO biz_oa_process "
                + "(process_code, process_name, category, icon, description, workflow_type, sort_order, status) "
                + "VALUES (?, ?, 'hr', ?, ?, 'oa_general', ?, 1)";
        Object[][] rows = {
                {"hr_onboard", "入職手續", "UserAddOutlined", "新員工入職登記與賬號開通審批流程", 11},
                {"hr_regular", "轉正申請", "CheckCircleOutlined", "試用期員工轉正審批流程", 12},
                {"hr_transfer", "調動申請", "SwapOutlined", "員工部門/職位調動審批流程", 13},
                {"hr_dimission", "離職手續", "UserDeleteOutlined", "員工離職結算與賬號停用審批流程", 14},
        };
        for (Object[] r : rows) {
            jdbcTemplate.update(sql, r[0], r[1], r[2], r[3], r[4]);
        }
    }

    /** 单据编号规则种子（RS + YYYYMMDD + 4位, 归属集团人事） */
    private void seedSeqRule() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                HrLifecycleConstants.SEQ_RULE_KEY, "HR入轉調離單據編號", "集團人事",
                "RS", "YYYYMMDD", 4, 1, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入 HR 入转调离单据编号规则种子");
        }
    }

    /** 后置校验：表与关键种子就绪，否则抛出不记版本 */
    private void verify() {
        Integer table = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hr_lifecycle_request'",
                Integer.class);
        if (table == null || table == 0) {
            throw new IllegalStateException("hr_lifecycle_request 表未就绪");
        }
        Integer processes = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_oa_process WHERE process_code IN ('hr_onboard','hr_regular','hr_transfer','hr_dimission')",
                Integer.class);
        if (processes == null || processes < 4) {
            throw new IllegalStateException("HR OA 流程定义种子未就绪");
        }
        Integer rule = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = ?",
                Integer.class, BizSeqService.RULE_HR_LIFECYCLE_REQUEST);
        if (rule == null || rule == 0) {
            throw new IllegalStateException("HR 单据编号规则种子未就绪");
        }
    }
}
