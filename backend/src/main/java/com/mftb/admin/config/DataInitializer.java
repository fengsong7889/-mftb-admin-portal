package com.mftb.admin.config;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.dto.MenuPermissionDTO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 数据初始化器: 启动时自动执行字段迁移与内置账号迁移, 并将 SQL 中的占位密码重置为正确的 BCrypt 加密值
 * <p>
 * 登录账号统一为工号, 工号按 MF 前缀自增(MF00001 起), 内置管理员工号 MF00001, 密码: 111222
 */
@Slf4j
@Component
@Order(5)
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final SysUserMapper sysUserMapper;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;

    /* ──────────────────────────────────────────────────────────
     *  产品版本号 (Semantic Versioning: major.minor.patch)
     *  — 与 pom.xml / package.json / sys_config(product_version) 保持同步
     *  — major: 不兼容的重大变更    — minor: 向下兼容的功能新增
     *  — patch: 向下兼容的问题修复
     * ────────────────────────────────────────────────────────── */
    public static final String PRODUCT_VERSION = "1.0.0";

    /** 结构迁移版本: 建表/补列等一次性 schema 变更, 变更时递增 minor 版本号 */
    // v5.0: 重跑幂等补列（修复存量库 ai_dept_auth_group 缺 description 列的漂移）
    // v6.0: OA 中心表自动创建（biz_oa_process / biz_oa_request / biz_oa_approval_task + 种子数据）
    // v7.0: biz_oa_request 扩展审批中心字段（集团/品牌/三级审批详情）
    private static final String V_SCHEMA = "core:schema-v8";
    /** 菜单种子版本：新增/调整种子菜单或英文名时递增 minor 版本号，无需全量重跑其他迁移 */
    // v11: 「工具註冊中心」更名為「AI 操作授權」，menu_key 由 ai_tool_registry 迁移为 ai-operation-auth
    //      （seedSystemMenus 會先刪除所有含 ai 的舊菜單及授權關聯再重建，舊 key 自動清理）
    // v12: 新增「MCP 服務」菜單；ai-access-request 併入主種子
    //      （獨立初始化器種的 AI 菜單會被本類的 '%ai%' 清理誤刪且 applyOnce 不會重跑，必須併入主種子）
    // v13: 「模型信息」更名為「模型接入」
    // v14: 新增「对话审计」菜單
    // v15: 新增「OA中心」一级菜单，「流程配置」从「系统配置」迁移至「OA中心」
    // v16: 设置 OA 中心图标，修正 permission/system-config 排序
    // v17: OA中心新增「流程中心」二级菜单
    // v19: 「员工AI权额总览」更名为「员工AI权额管理」
    // v20: 修正顶级菜单排序（團購管理=7, 智能中心AI=8, OA中心=12）及图标
    // v21: 对齐开发环境顶级菜单顺序（智能中心AI=7, 團購管理=8, OA中心=10, 權限管理=11, 系統配置=12）
    // v22: OA中心子菜单排序修正：流程中心=1, 流程事項=2, 流程配置=3
    // v23: 物資管理 4 個子菜單（asset-add/claim/transfer/return）合併到「資產台賬」作為其行/頂部操作；
    //      自動清理已被合併的孤立菜單 + 對齊子菜單排序與圖標
    // v24: EAM 完整菜單樹（19 個子菜單：看板/台賬/基礎數據/採購/領用/歸還/調撥/維修/賠付/報廢/歷史/盤點/報表）
    // v25: 「存放位置」更名為「倉庫維護」
    // v26: 採購申請/採購訂單菜單遷移至 OA 中心，移除物資管理下的採購菜單
    // v27: 种子数据不再覆盖用户在「菜单配置」中自定义的菜单名称（仅修复占位数据名称）
    private static final String V_MENU_SEED = "core:menu-seed-v27";

    @Override
    public void run(String... args) {
        // 一次性迁移按版本执行, 已执行的步骤重启时直接跳过 (启动提速);
        // 菜单种子独立版本: 菜单改动只需递增 V_MENU_SEED, 不影响其他迁移
        versionTracker.applyOnce(V_SCHEMA, this::migrateSchema);
        // 迁移旧表数据到统一 OA 表
        versionTracker.applyOnce("core:oa-data-migrate-v1", this::migrateOaData);
        // 迁移 AI 申请数据到统一 OA 表
        versionTracker.applyOnce("core:oa-data-migrate-v2", this::migrateAiAccessData);
        // 修复已迁移数据的空字段（从 biz_fin_approval 重新同步）
        versionTracker.applyOnce("core:oa-data-migrate-v3", this::fixMigratedOaData);
        // 修复 AI 申请记录的节点名称和审批人（从 biz_workflow_config 读取）
        versionTracker.applyOnce("core:oa-data-migrate-v5", this::fixAiAccessOaData);
        versionTracker.applyOnce(V_MENU_SEED, () -> {
            seedSystemMenus();
            seedMenuEnglishNames();
            adjustAiCenterMenus();
        });
        // 旧版 JSON 权限迁移必须晚于菜单种子化执行:
        // 否则 resolveMenuId 会为尚未种子的菜单键创建占位菜单(name=menu_key, parent_id=NULL),
        // 被菜单树 buildTree 的孤儿兜底逻辑顶成一级菜单(生产事故: 實驗沙盤子菜单顶到一级)
        versionTracker.applyOnce("core:legacy-perm-migrate-v1", () -> {
            migrateRolePermissions();
            migrateDepartmentPermissions();
        });
        versionTracker.applyOnce("core:fin-batch-uk-v1", this::fixFinBatchUniqueKey);
        versionTracker.applyOnce("core:builtin-accounts-v1", this::migrateBuiltinAccounts);
        // 为所有缺少职务记录的员工补一条默认「入职」记录
        versionTracker.applyOnce("core:emp-position-backfill-v1", this::backfillInitialPositionRecords);
        // v24b: 恢復被 v23 清理邏輯誤刪的 asset-claim / asset-return 菜單
        versionTracker.applyOnce("core:eam-restore-v1", this::restoreEamClaimReturnMenus);
        // v24c: 移除「統計報表」菜單（已與「資產看板」合併）
        versionTracker.applyOnce("core:eam-remove-report-v1", this::removeAssetReportMenu);
        // v25: 「資產流轉」改名為「資產管理」
versionTracker.applyOnce("core:eam-rename-flow-ops-v1", this::renameAssetFlowOpsMenu);
// v26: 「領用管理」改名為「領用歸還」
versionTracker.applyOnce("core:eam-rename-claim-v1", this::renameAssetClaimMenu);
        // 以下为低成本兜底逻辑(无待迁移数据时仅 1~2 条查询), 每次启动保留执行
        migrateEmpIdToMF();
        migrateDeptCodeToBM();
        resetPasswordIfNeeded("MF00001", "111222");
        ensureDeptAdSalesPermission();
        ensureAssetManagementMenu();
        fixAssetMenuGrouping();
        // 同步产品版本号到 sys_config (每次启动保持与代码一致)
        syncProductVersion();
    }

    /** 将代码中声明的产品版本号同步写入 sys_config (幂等: INSERT ... ON DUPLICATE KEY UPDATE) */
    private void syncProductVersion() {
        try {
            jdbcTemplate.update(
                    "INSERT INTO sys_config (config_key, config_value, description) VALUES (?, ?, ?) "
                            + "ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
                    "product_version", PRODUCT_VERSION,
                    "产品版本号 (Semantic Versioning), 与 pom.xml / package.json 同步");
        } catch (Exception e) {
            log.warn("产品版本号同步失败: {}", e.getMessage());
        }
    }

    /** 内置账号迁移: 登录账号统一为工号, 移除 guest 账号 (旧库 admin 账号由 migrateEmpIdToMF 统一重编号) */
    private void migrateBuiltinAccounts() {
        int removed = jdbcTemplate.update("DELETE FROM sys_user WHERE username = 'guest'");
        if (removed > 0) {
            log.info("已移除内置 guest 账号");
        }
    }

    /**
     * 存量工号迁移: 将所有非 MF 格式登录账号的员工(含逻辑删除记录)按 id 升序重编号为 MF00001+,
     * 登录账号与工号同步更新; 已是 MF 格式的记录不变, 重复启动幂等
     */
    private void migrateEmpIdToMF() {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_user WHERE username NOT REGEXP '^MF[0-9]+$' ORDER BY id", Long.class);
        if (ids.isEmpty()) {
            return;
        }
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(username, 3) AS UNSIGNED)), 0) FROM sys_user "
                        + "WHERE username REGEXP '^MF[0-9]+$'",
                Integer.class);
        int seq = maxSeq == null ? 0 : maxSeq;
        for (Long id : ids) {
            String empId = String.format("MF%05d", ++seq);
            jdbcTemplate.update("UPDATE sys_user SET username = ?, emp_id = ? WHERE id = ?", empId, empId, id);
        }
        log.info("已将 {} 个存量员工工号迁移为 MF 自增格式", ids.size());
    }

    /**
     * 存量部门编码迁移: 将所有非 BM 格式编码的部门(含逻辑删除记录)按 id 升序重编号为 BM00001+
     * (对应编号生成规则 dept_code); 已是 BM 格式的记录不变, 重复启动幂等
     */
    private void migrateDeptCodeToBM() {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_department WHERE code NOT REGEXP '^BM[0-9]+$' ORDER BY id", Long.class);
        if (ids.isEmpty()) {
            return;
        }
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(code, 3) AS UNSIGNED)), 0) FROM sys_department "
                        + "WHERE code REGEXP '^BM[0-9]+$'",
                Integer.class);
        int seq = maxSeq == null ? 0 : maxSeq;
        for (Long id : ids) {
            String code = String.format("BM%05d", ++seq);
            jdbcTemplate.update("UPDATE sys_department SET code = ? WHERE id = ?", code, id);
        }
        log.info("已将 {} 个存量部门编码迁移为 BM 自增格式", ids.size());
    }

    /** 幂等字段迁移: 列不存在时自动 ALTER TABLE (免手动执行 SQL 脚本) */
    private void migrateSchema() {
        addColumnIfAbsent("sys_user", "function_roles",
                "ALTER TABLE sys_user ADD COLUMN function_roles TEXT NULL COMMENT '绑定的功能角色ID JSON数组' AFTER role");
        addColumnIfAbsent("sys_role", "permissions",
                "ALTER TABLE sys_role ADD COLUMN permissions TEXT NULL COMMENT '菜单权限 JSON数组' AFTER description");
        addColumnIfAbsent("sys_user", "department_id",
                "ALTER TABLE sys_user ADD COLUMN department_id BIGINT NULL COMMENT '所在部门ID' AFTER function_roles");
        addColumnIfAbsent("sys_role", "updated_by",
                "ALTER TABLE sys_role ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER status");
        migrateMenuTable();
        createDepartmentTableIfAbsent();
        addColumnIfAbsent("sys_department", "updated_by",
                "ALTER TABLE sys_department ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER sort");
        addColumnIfAbsent("sys_department", "name_en",
                "ALTER TABLE sys_department ADD COLUMN name_en VARCHAR(128) NULL COMMENT '部门英文名称' AFTER name");
        createPositionTableIfAbsent();
        addColumnIfAbsent("sys_position", "name_en",
                "ALTER TABLE sys_position ADD COLUMN name_en VARCHAR(128) NULL COMMENT '职位英文名称' AFTER name");
        addColumnIfAbsent("sys_position", "rank",
                "ALTER TABLE sys_position ADD COLUMN `rank` VARCHAR(8) NULL COMMENT '职等 R1~R5' AFTER job_level");
        addColumnIfAbsent("sys_user", "position_id",
                "ALTER TABLE sys_user ADD COLUMN position_id BIGINT NULL COMMENT '职位ID' AFTER department");
        addColumnIfAbsent("sys_user", "job_level",
                "ALTER TABLE sys_user ADD COLUMN job_level VARCHAR(32) NULL COMMENT '职级快照' AFTER position");
        addColumnIfAbsent("sys_user", "position_en",
                "ALTER TABLE sys_user ADD COLUMN position_en VARCHAR(128) NULL COMMENT '职位英文名称快照' AFTER position");
        addColumnIfAbsent("sys_user", "sequence",
                "ALTER TABLE sys_user ADD COLUMN sequence VARCHAR(8) NULL COMMENT '职级序列快照: M=管理 T=技术 P=专业' AFTER position_en");
        addColumnIfAbsent("sys_user", "rank",
                "ALTER TABLE sys_user ADD COLUMN `rank` VARCHAR(8) NULL COMMENT '职等 R1~R5' AFTER job_level");
        addColumnIfAbsent("sys_user", "updated_by",
                "ALTER TABLE sys_user ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER status");
        backfillUserPositionEn();
        backfillUserSequence();
        migrateRoleMenuTable();
        migrateDepartmentMenuTable();
        createDataAuthorizationTable();
        migrateFinRiskStatusColumn();
        migrateFinRiskReleaseColumns();
        migrateFinRiskSimplifyColumns();
        addColumnIfAbsent("sys_user", "quick_favorites",
                "ALTER TABLE sys_user ADD COLUMN quick_favorites VARCHAR(1024) NULL "
                        + "COMMENT '快捷入口菜单key列表，JSON数组格式' AFTER force_logout_reason");
        addColumnIfAbsent("sys_user", "avatar_url",
                "ALTER TABLE sys_user ADD COLUMN avatar_url VARCHAR(512) NULL "
                        + "COMMENT '用户选中的在线头像URL（IconFont/DiceBear等外部URL）' AFTER avatar");
        // 73_avatar_mediumtext.sql 等效: avatar 字段扩容支持 base64 Data URL
        migrateAvatarMediumText();
        // AI 中心表自动创建 (85/88/68 脚本等效, 幂等)
        migrateAiCenterTables();
        // OA 中心表自动创建 (108 脚本等效, 幂等)
        migrateOaTables();
        // ai_dept_auth_group 新增 description 字段
        addColumnIfAbsent("ai_dept_auth_group", "description",
                "ALTER TABLE ai_dept_auth_group ADD COLUMN description VARCHAR(500) NULL COMMENT '策略描述' AFTER name");
        // 员工详情页: sys_user 新增 18 个基础信息字段
        migrateEmployeeDetailColumns();
        // 员工详情页: 新建紧急联系人 + 职务记录表
        migrateEmployeeDetailTables();
        // 菜单种子化与旧权限迁移由 run() 按独立版本调度, 保证顺序: schema → 菜单种子 → 权限迁移
    }

    /** 员工详情页: sys_user 新增 18 个基础信息字段（个人信息/证件信息/通讯信息） */
    private void migrateEmployeeDetailColumns() {
        // 个人信息
        addColumnIfAbsent("sys_user", "nationality",
                "ALTER TABLE sys_user ADD COLUMN nationality VARCHAR(50) DEFAULT NULL COMMENT '国籍'");
        addColumnIfAbsent("sys_user", "ethnicity",
                "ALTER TABLE sys_user ADD COLUMN ethnicity VARCHAR(20) DEFAULT NULL COMMENT '民族'");
        addColumnIfAbsent("sys_user", "birth_date",
                "ALTER TABLE sys_user ADD COLUMN birth_date DATE DEFAULT NULL COMMENT '出生日期'");
        addColumnIfAbsent("sys_user", "marital_status",
                "ALTER TABLE sys_user ADD COLUMN marital_status VARCHAR(10) DEFAULT NULL COMMENT '婚姻状况'");
        addColumnIfAbsent("sys_user", "political_status",
                "ALTER TABLE sys_user ADD COLUMN political_status VARCHAR(20) DEFAULT NULL COMMENT '政治面貌'");
        addColumnIfAbsent("sys_user", "religion",
                "ALTER TABLE sys_user ADD COLUMN religion VARCHAR(20) DEFAULT NULL COMMENT '宗教信仰'");
        // 证件信息
        addColumnIfAbsent("sys_user", "id_type",
                "ALTER TABLE sys_user ADD COLUMN id_type VARCHAR(30) DEFAULT NULL COMMENT '证件类型'");
        addColumnIfAbsent("sys_user", "id_number",
                "ALTER TABLE sys_user ADD COLUMN id_number VARCHAR(50) DEFAULT NULL COMMENT '证件号码'");
        addColumnIfAbsent("sys_user", "id_address",
                "ALTER TABLE sys_user ADD COLUMN id_address VARCHAR(200) DEFAULT NULL COMMENT '证件地址'");
        addColumnIfAbsent("sys_user", "household_type",
                "ALTER TABLE sys_user ADD COLUMN household_type VARCHAR(30) DEFAULT NULL COMMENT '户籍类型'");
        addColumnIfAbsent("sys_user", "household_location",
                "ALTER TABLE sys_user ADD COLUMN household_location VARCHAR(100) DEFAULT NULL COMMENT '户籍所在地'");
        addColumnIfAbsent("sys_user", "native_place",
                "ALTER TABLE sys_user ADD COLUMN native_place VARCHAR(100) DEFAULT NULL COMMENT '籍贯'");
        // 通讯信息
        addColumnIfAbsent("sys_user", "address_country",
                "ALTER TABLE sys_user ADD COLUMN address_country VARCHAR(50) DEFAULT NULL COMMENT '住址-国家'");
        addColumnIfAbsent("sys_user", "address_city",
                "ALTER TABLE sys_user ADD COLUMN address_city VARCHAR(50) DEFAULT NULL COMMENT '住址-城市'");
        addColumnIfAbsent("sys_user", "address_detail",
                "ALTER TABLE sys_user ADD COLUMN address_detail VARCHAR(300) DEFAULT NULL COMMENT '住址-详细地址'");
    }

    /** 员工详情页: 新建 emp_emergency_contact + emp_position_record 表 */
    private void migrateEmployeeDetailTables() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS emp_emergency_contact ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "user_id BIGINT NOT NULL COMMENT '关联 sys_user.id', "
                        + "name VARCHAR(50) NOT NULL COMMENT '联系人姓名', "
                        + "phone VARCHAR(30) NOT NULL COMMENT '联系电话', "
                        + "relation VARCHAR(30) NOT NULL COMMENT '关系', "
                        + "created_by VARCHAR(50) DEFAULT NULL COMMENT '创建人', "
                        + "updated_by VARCHAR(50) DEFAULT NULL COMMENT '更新人', "
                        + "deleted INT NOT NULL DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "INDEX idx_user_id (user_id)"
                        + ") COMMENT='员工紧急联系人'");
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS emp_position_record ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "user_id BIGINT NOT NULL COMMENT '关联 sys_user.id', "
                        + "effective_date DATE NOT NULL COMMENT '生效日期', "
                        + "effective_seq INT NOT NULL DEFAULT 0 COMMENT '生效序号', "
                        + "operation VARCHAR(20) NOT NULL COMMENT '操作类型', "
                        + "reason VARCHAR(200) DEFAULT NULL COMMENT '变动原因', "
                        + "service_dept VARCHAR(100) DEFAULT NULL COMMENT '服务部门', "
                        + "sequence_type VARCHAR(10) DEFAULT NULL COMMENT '职级序列', "
                        + "position_level VARCHAR(10) DEFAULT NULL COMMENT '职级', "
                        + "rank_code VARCHAR(10) DEFAULT NULL COMMENT '职等', "
                        + "company VARCHAR(100) DEFAULT NULL COMMENT '任职公司', "
                        + "employee_category VARCHAR(30) DEFAULT NULL COMMENT '员工类别', "
                        + "work_system VARCHAR(20) DEFAULT NULL COMMENT '工时制', "
                        + "position_name VARCHAR(100) DEFAULT NULL COMMENT '职位', "
                        + "direct_superior VARCHAR(50) DEFAULT NULL COMMENT '直属上级', "
                        + "mentor VARCHAR(50) DEFAULT NULL COMMENT '导师', "
                        + "work_country VARCHAR(50) DEFAULT NULL COMMENT '工作国家', "
                        + "work_city VARCHAR(50) DEFAULT NULL COMMENT '工作城市', "
                        + "office_address VARCHAR(200) DEFAULT NULL COMMENT '办公地址', "
                        + "contract_location VARCHAR(100) DEFAULT NULL COMMENT '合同签订地', "
                        + "created_by VARCHAR(50) DEFAULT NULL, "
                        + "updated_by VARCHAR(50) DEFAULT NULL, "
                        + "deleted INT NOT NULL DEFAULT 0, "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "INDEX idx_user_id (user_id), "
                        + "INDEX idx_user_seq (user_id, effective_seq)"
                        + ") COMMENT='员工职务记录'");
        log.info("员工详情页表结构就绪: emp_emergency_contact + emp_position_record");
    }

    /**
     * 为所有缺少职务记录的员工补一条默认「入职」记录:
     * - 生效日期 = 员工账号创建日期
     * - 服务部门 = 员工当前部门名称
     * - 职位 = 员工当前职位名称
     * - 职级序列/职级/职等 = 员工当前快照
     * - 工作国家 = 中国
     * - 其余字段为空
     */
    private void backfillInitialPositionRecords() {
        // 查询所有未删除的员工
        List<Map<String, Object>> users = jdbcTemplate.queryForList(
                "SELECT id, department, position, position_en, sequence, job_level, `rank`, created_at "
                        + "FROM sys_user WHERE deleted = 0");
        if (users.isEmpty()) return;

        // 查询已有职务记录的 user_id 集合
        List<Long> usersWithRecords = jdbcTemplate.queryForList(
                "SELECT DISTINCT user_id FROM emp_position_record WHERE deleted = 0",
                Long.class);
        java.util.Set<Long> hasRecord = new java.util.HashSet<>(usersWithRecords);

        int count = 0;
        for (Map<String, Object> user : users) {
            Long userId = ((Number) user.get("id")).longValue();
            if (hasRecord.contains(userId)) continue;

            // 生效日期取账号创建日期，格式 yyyy-MM-dd
            String effectiveDate = "1970-01-01";
            Object createdAt = user.get("created_at");
            if (createdAt != null) {
                String dateStr = createdAt.toString();
                // 兼容 java.sql.Timestamp / LocalDateTime / 字符串
                effectiveDate = dateStr.length() >= 10 ? dateStr.substring(0, 10) : dateStr;
            }

            String serviceDept = user.get("department") != null ? user.get("department").toString() : null;
            String positionName = user.get("position") != null ? user.get("position").toString() : null;
            String sequenceType = user.get("sequence") != null ? user.get("sequence").toString() : null;
            String positionLevel = user.get("job_level") != null ? user.get("job_level").toString() : null;
            String rankCode = user.get("rank") != null ? user.get("rank").toString() : null;

            jdbcTemplate.update(
                    "INSERT INTO emp_position_record "
                            + "(user_id, effective_date, effective_seq, operation, "
                            + "service_dept, sequence_type, position_level, rank_code, "
                            + "work_country, deleted, created_at, updated_at) "
                            + "VALUES (?, ?, 0, '入职', ?, ?, ?, ?, '中国', 0, NOW(), NOW())",
                    userId, effectiveDate,
                    serviceDept, sequenceType, positionLevel, rankCode);
            count++;
        }
        if (count > 0) {
            log.info("已为 {} 名员工补录默认「入职」职务记录", count);
        } else {
            log.info("所有员工已有职务记录，无需补录");
        }
    }

    /** avatar 字段扩容: VARCHAR(255) → MEDIUMTEXT, 支持 base64 Data URL / DiceBear URL 等长文本存储 (与 73_avatar_mediumtext.sql 等效) */
    private void migrateAvatarMediumText() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'avatar'",
                Integer.class);
        if (count == null || count == 0) {
            return;
        }
        String type = jdbcTemplate.queryForObject(
                "SELECT DATA_TYPE FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_user' AND COLUMN_NAME = 'avatar'",
                String.class);
        if (!"mediumtext".equalsIgnoreCase(type)) {
            jdbcTemplate.execute(
                    "ALTER TABLE sys_user MODIFY COLUMN avatar MEDIUMTEXT COMMENT '头像（pikachu expression / dicebear URL / base64）'");
            log.info("已将 sys_user.avatar 扩容为 MEDIUMTEXT");
        }
    }

    /**
     * AI 中心表自动创建 (85_ai_center_tables / 88_dept_auth_group / 68_llm_usage 脚本等效)
     * 包含 ai_provider, ai_model(含 86/92 增量列), ai_employee_auth, ai_quota_config,
     * ai_dept_auth_group, ai_dept_auth_group_dept, ai_dept_auth_group_model,
     * biz_llm_usage 共 8 张表。全部使用 CREATE TABLE IF NOT EXISTS，幂等安全。
     * 注：一代 ai_position_model_mapping / ai_role_model_mapping / ai_department_auth /
     * ai_usage_log / ai_tool_registry 已随授权源收敛到二代（ai_dept_auth_group* /
     * ai_emp_pos_auth_strategy / ai_emp_role_auth）与 biz_llm_usage 计量而退役，不再建表。
     */
    private void migrateAiCenterTables() {
        // 1. ai_provider
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS ai_provider ("
            + "id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + "provider_key VARCHAR(50) NOT NULL UNIQUE COMMENT '供应商标识',"
            + "name VARCHAR(100) NOT NULL COMMENT '供应商名称',"
            + "description VARCHAR(500) DEFAULT NULL COMMENT '供应商描述',"
            + "api_base_url VARCHAR(500) DEFAULT NULL COMMENT 'API 基础 URL',"
            + "api_key VARCHAR(500) DEFAULT NULL COMMENT 'API Key(加密存储)',"
            + "status TINYINT DEFAULT 1 COMMENT '状态：1=启用 0=停用',"
            + "is_default TINYINT DEFAULT 0 COMMENT '是否默认供应商',"
            + "config_json TEXT DEFAULT NULL COMMENT '配置信息 JSON',"
            + "sort_order INT DEFAULT 0 COMMENT '排序',"
            + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除',"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            + "INDEX idx_provider_key (provider_key), INDEX idx_status (status)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 供应商表'");

        // 2. ai_model (含 86 能力字段 + 92 deploy_type, 唯一约束用 87 新版)
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS ai_model ("
            + "id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + "provider_id BIGINT DEFAULT NULL COMMENT '供应商 ID',"
            + "model_key VARCHAR(50) NOT NULL COMMENT '模型标识',"
            + "name VARCHAR(100) NOT NULL COMMENT '模型名称',"
            + "version VARCHAR(64) DEFAULT NULL COMMENT '模型版本号',"
            + "description VARCHAR(500) DEFAULT NULL COMMENT '模型描述',"
            + "api_compat VARCHAR(20) DEFAULT 'openai' COMMENT 'API 兼容格式',"
            + "modalities VARCHAR(100) DEFAULT 'text' COMMENT '支持模态',"
            + "vision_support TINYINT DEFAULT 0 COMMENT '视觉理解',"
            + "function_calling TINYINT DEFAULT 0 COMMENT '工具调用',"
            + "json_mode TINYINT DEFAULT 0 COMMENT 'JSON 模式',"
            + "streaming TINYINT DEFAULT 1 COMMENT '流式响应',"
            + "thinking_mode TINYINT DEFAULT 0 COMMENT '思考模式',"
            + "type VARCHAR(50) DEFAULT 'chat' COMMENT '模型类型',"
            + "deploy_type VARCHAR(20) NOT NULL DEFAULT 'cloud' COMMENT '部署类型',"
            + "context_window INT DEFAULT 0 COMMENT '上下文窗口',"
            + "max_output_tokens INT DEFAULT 0 COMMENT '最大输出 tokens',"
            + "input_price DECIMAL(10,6) DEFAULT 0 COMMENT '输入价格',"
            + "output_price DECIMAL(10,6) DEFAULT 0 COMMENT '输出价格',"
            + "cached_input_price DECIMAL(10,4) DEFAULT NULL COMMENT '缓存命中输入价',"
            + "currency VARCHAR(10) DEFAULT 'CNY' COMMENT '计费币种',"
            + "concurrency_limit INT DEFAULT NULL COMMENT '并发限制',"
            + "status TINYINT DEFAULT 1 COMMENT '状态',"
            + "sort_order INT DEFAULT 0 COMMENT '排序',"
            + "updated_by VARCHAR(50) DEFAULT NULL COMMENT '最后更新人',"
            + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除',"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            + "UNIQUE KEY uk_provider_key_version (provider_id, model_key, version),"
            + "INDEX idx_provider_id (provider_id), INDEX idx_status (status)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 模型表'");

        // 3. ai_employee_auth
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS ai_employee_auth ("
            + "id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + "employee_id BIGINT NOT NULL, model_id BIGINT NOT NULL,"
            + "has_permission TINYINT DEFAULT 1, limit_type VARCHAR(20) DEFAULT 'none',"
            + "daily_limit INT DEFAULT 0, monthly_limit INT DEFAULT 0, custom_limit INT DEFAULT 0,"
            + "current_daily_usage BIGINT DEFAULT 0, current_monthly_usage BIGINT DEFAULT 0,"
            + "reset_date DATE DEFAULT NULL,"
            + "status TINYINT DEFAULT 1, deleted TINYINT DEFAULT 0,"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            + "UNIQUE KEY uk_employee_model (employee_id, model_id),"
            + "INDEX idx_employee_id (employee_id), INDEX idx_model_id (model_id)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工模型权限表'");

        // 4. ai_quota_config
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS ai_quota_config ("
            + "id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + "quota_type VARCHAR(20) NOT NULL, target_id BIGINT NOT NULL,"
            + "model_id BIGINT DEFAULT NULL,"
            + "daily_quota INT DEFAULT 0, monthly_quota INT DEFAULT 0,"
            + "used_today BIGINT DEFAULT 0, used_month BIGINT DEFAULT 0,"
            + "quota_period_start DATE DEFAULT NULL, quota_period_end DATE DEFAULT NULL,"
            + "auto_reset TINYINT DEFAULT 1, reset_day_of_month TINYINT DEFAULT 1,"
            + "status TINYINT DEFAULT 1, deleted TINYINT DEFAULT 0,"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            + "UNIQUE KEY uk_quota_target_model (quota_type, target_id, model_id),"
            + "INDEX idx_quota_type_id (quota_type, target_id), INDEX idx_model_id (model_id)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门/员工额度配置表'");

        // 5. ai_dept_auth_group (88_dept_auth_group)
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS ai_dept_auth_group ("
            + "id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + "config_code VARCHAR(32) DEFAULT NULL COMMENT '配置ID（按编号生成规则 ai_dept_model_auth 生成）',"
            + "name VARCHAR(100) NOT NULL, description VARCHAR(500) DEFAULT NULL,"
            + "data_residency TINYINT DEFAULT 0,"
            + "status TINYINT DEFAULT 1, total_employee_count INT DEFAULT 0,"
            + "updated_by VARCHAR(50) DEFAULT NULL, deleted TINYINT DEFAULT 0,"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            + "INDEX idx_status (status)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='部门模型授权策略主表'");

        // 6. ai_dept_auth_group_dept
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS ai_dept_auth_group_dept ("
            + "id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + "group_id BIGINT NOT NULL, department_id BIGINT NOT NULL,"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "UNIQUE KEY uk_group_dept (group_id, department_id),"
            + "INDEX idx_group_id (group_id), INDEX idx_department_id (department_id)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='策略-部门关联表'");

        // 7. ai_dept_auth_group_model
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS ai_dept_auth_group_model ("
            + "id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + "group_id BIGINT NOT NULL, model_id BIGINT NOT NULL,"
            + "vision_support TINYINT DEFAULT 1, function_calling TINYINT DEFAULT 1,"
            + "json_mode TINYINT DEFAULT 1, streaming TINYINT DEFAULT 1,"
            + "thinking_mode TINYINT DEFAULT 1, priority INT DEFAULT 0,"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,"
            + "UNIQUE KEY uk_group_model (group_id, model_id),"
            + "INDEX idx_group_id (group_id), INDEX idx_model_id (model_id)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='策略-模型授权与能力配置表'");

        // 8. biz_llm_usage (68_llm_usage)
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS biz_llm_usage ("
            + "id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,"
            + "username VARCHAR(64) NOT NULL, mode VARCHAR(16) NOT NULL,"
            + "channel VARCHAR(16) NOT NULL, model VARCHAR(64) NOT NULL,"
            + "prompt_tokens INT NOT NULL DEFAULT 0, completion_tokens INT NOT NULL DEFAULT 0,"
            + "cached_tokens INT NOT NULL DEFAULT 0,"
            + "cost DECIMAL(12,6) NOT NULL DEFAULT 0, currency VARCHAR(8) NOT NULL DEFAULT '',"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            + "INDEX idx_user_time (username, created_at), INDEX idx_time (created_at)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 助手使用统计明细'");

        log.info("AI 中心表自动创建完成 (幂等, 已存在则跳过)");

        // ---- 种子数据: 供应商 + 模型 (INSERT IGNORE 幂等) ----
        jdbcTemplate.execute(
            "INSERT IGNORE INTO ai_provider (provider_key, name, description, api_base_url, status, is_default, sort_order) VALUES"
            + " ('dashscope', '阿里云百炼', '阿里云百炼大模型平台 (通义千问系列)', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 1, 1, 1),"
            + " ('deepseek', 'DeepSeek', 'DeepSeek 大模型', 'https://api.deepseek.com/v1', 1, 0, 2)");

        // 模型种子: 使用子查询获取 provider_id, 避免硬编码自增 ID
        jdbcTemplate.execute(
            "INSERT IGNORE INTO ai_model (provider_id, model_key, name, version, description, api_compat, type, deploy_type,"
            + " modalities, vision_support, function_calling, json_mode, streaming, thinking_mode,"
            + " context_window, max_output_tokens, input_price, output_price, cached_input_price, currency,"
            + " status, sort_order)"
            + " SELECT p.id, 'qwen3.7-flash', '通义千问 3.7 Flash', NULL, '阿里云百炼 qwen3.7-flash 轻量模型',"
            + " 'openai', 'chat', 'cloud', 'text', 0, 1, 1, 1, 0,"
            + " 200000, 8192, 0.200000, 0.800000, 0.040000, 'CNY', 1, 1"
            + " FROM ai_provider p WHERE p.provider_key = 'dashscope' LIMIT 1");

        jdbcTemplate.execute(
            "INSERT IGNORE INTO ai_model (provider_id, model_key, name, version, description, api_compat, type, deploy_type,"
            + " modalities, vision_support, function_calling, json_mode, streaming, thinking_mode,"
            + " context_window, max_output_tokens, input_price, output_price, cached_input_price, currency,"
            + " status, sort_order)"
            + " SELECT p.id, 'deepseek-chat', 'DeepSeek Chat', NULL, 'DeepSeek-V3 对话模型',"
            + " 'openai', 'chat', 'cloud', 'text', 0, 1, 1, 1, 1,"
            + " 128000, 8192, 0.220000, 0.660000, NULL, 'USD', 1, 2"
            + " FROM ai_provider p WHERE p.provider_key = 'deepseek' LIMIT 1");

        jdbcTemplate.execute(
            "INSERT IGNORE INTO ai_model (provider_id, model_key, name, version, description, api_compat, type, deploy_type,"
            + " modalities, vision_support, function_calling, json_mode, streaming, thinking_mode,"
            + " context_window, max_output_tokens, input_price, output_price, cached_input_price, currency,"
            + " status, sort_order)"
            + " SELECT p.id, 'deepseek-v4-flash', 'DeepSeek V4 Flash', NULL, 'DeepSeek V4 Flash 轻量模型',"
            + " 'openai', 'chat', 'cloud', 'text', 0, 1, 1, 1, 0,"
            + " 128000, 8192, 0.220000, 0.660000, NULL, 'USD', 1, 3"
            + " FROM ai_provider p WHERE p.provider_key = 'deepseek' LIMIT 1");

        log.info("AI 供应商与模型种子数据插入完成 (幂等)");

        // 清理开发环境占位符 API Key（sk-test_* 等测试密钥不应被视为真实对接）
        int cleaned = jdbcTemplate.update(
            "UPDATE ai_provider SET api_key = NULL WHERE api_key LIKE 'sk-test_%' OR api_key LIKE '%placeholder%' OR api_key LIKE '%test_%key%'");
        if (cleaned > 0) {
            log.info("已清理 {} 个供应商的占位符 API Key", cleaned);
        }
    }

    /** 消费风控登记制: biz_fin_risk_config 新增 status 列 (表存在时才迁移, 与 66_fin_risk_config_status.sql 等效) */
    private void migrateFinRiskStatusColumn() {
        Integer tables = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config'",
                Integer.class);
        if (tables == null || tables == 0) {
            return;
        }
        addColumnIfAbsent("biz_fin_risk_config", "status",
                "ALTER TABLE biz_fin_risk_config ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'enabled' "
                        + "COMMENT '状态: enabled=启用 disabled=停用' AFTER risk_mode");
    }

    /** 消费风控已付池增强: 未付部分释放方式 release_mode + 每月释放比例 monthly_release_ratio (与 67 脚本等效) */
    private void migrateFinRiskReleaseColumns() {
        Integer tables = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config'",
                Integer.class);
        if (tables == null || tables == 0) {
            return;
        }
        addColumnIfAbsent("biz_fin_risk_config", "release_mode",
                "ALTER TABLE biz_fin_risk_config ADD COLUMN release_mode VARCHAR(16) NOT NULL DEFAULT 'repay' "
                        + "COMMENT '未付部分释放方式: repay=还款释放 monthly=每月比例释放' AFTER status");
        addColumnIfAbsent("biz_fin_risk_config", "monthly_release_ratio",
                "ALTER TABLE biz_fin_risk_config ADD COLUMN monthly_release_ratio DECIMAL(6,4) NULL "
                        + "COMMENT '每月释放比例(小数, 如0.1000=10%/月, monthly模式生效)' AFTER release_mode");
    }

    /** 风控模型简化: 废弃 risk_mode / fixed_limit_amount / monthly_release_amount 列 (与 68 脚本等效) */
    private void migrateFinRiskSimplifyColumns() {
        Integer tables = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_risk_config'",
                Integer.class);
        if (tables == null || tables == 0) {
            return;
        }
        dropColumnIfPresent("biz_fin_risk_config", "risk_mode");
        dropColumnIfPresent("biz_fin_risk_config", "fixed_limit_amount");
        dropColumnIfPresent("biz_fin_risk_config", "monthly_release_amount");
    }

    /** 列存在时删除 */
    private void dropColumnIfPresent(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (count != null && count > 0) {
            jdbcTemplate.execute("ALTER TABLE " + table + " DROP COLUMN " + column);
            log.info("已自动废弃字段 {}.{}", table, column);
        }
    }

    /** 回填存量员工的职级序列快照 (仅处理空值, 可重复执行) */
    private void backfillUserSequence() {
        int filled = jdbcTemplate.update(
                "UPDATE sys_user u JOIN sys_position p ON u.position_id = p.id "
                        + "SET u.sequence = p.sequence "
                        + "WHERE u.sequence IS NULL");
        if (filled > 0) {
            log.info("已回填 {} 名员工的职级序列快照", filled);
        }
    }

    /** 回填存量员工的职位英文名称快照 (仅处理空值, 可重复执行) */
    private void backfillUserPositionEn() {
        int filled = jdbcTemplate.update(
                "UPDATE sys_user u JOIN sys_position p ON u.position_id = p.id "
                        + "SET u.position_en = p.name_en "
                        + "WHERE u.position_en IS NULL AND p.name_en IS NOT NULL");
        if (filled > 0) {
            log.info("已回填 {} 名员工的职位英文名称快照", filled);
        }
    }

    /** 集团人事-职位表不存在时自动创建 */
    private void createPositionTableIfAbsent() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_position'",
                Integer.class);
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE sys_position ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                        + "code VARCHAR(32) NULL COMMENT '职位ID（按编号生成规则 position_id 生成）', "
                        + "name VARCHAR(128) NOT NULL COMMENT '职位名称', "
                        + "name_en VARCHAR(128) NULL COMMENT '职位英文名称', "
                        + "sequence VARCHAR(8) NOT NULL COMMENT '职级序列: M=管理 T=技术 P=专业', "
                        + "job_level VARCHAR(32) NOT NULL COMMENT '职级', "
                        + "`rank` VARCHAR(8) NULL COMMENT '职等 R1~R5', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                        + ") COMMENT='集团人事-职位表'");
        log.info("已自动创建职位表 sys_position");
    }

    /** 组织架构-部门表不存在时自动创建 */
    private void createDepartmentTableIfAbsent() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_department'",
                Integer.class);
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE sys_department ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                        + "code VARCHAR(64) NOT NULL COMMENT '部门编码', "
                        + "name VARCHAR(128) NOT NULL COMMENT '部门名称', "
                        + "parent_id BIGINT NULL COMMENT '上级部门ID', "
                        + "leader VARCHAR(64) NULL COMMENT '部门对接人', "
                        + "permissions TEXT NULL COMMENT '部门授权菜单权限 JSON数组', "
                        + "status INT DEFAULT 1 COMMENT '状态: 1=有效 0=无效', "
                        + "sort INT DEFAULT 0 COMMENT '排序', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
                        + ") COMMENT='集团组织架构-部门表'");
        log.info("已自动创建部门表 sys_department");
    }

    private void addColumnIfAbsent(String table, String column, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        if (count == null || count == 0) {
            jdbcTemplate.execute(alterSql);
            log.info("已自动迁移字段 {}.{}", table, column);
        }
    }

    /** 系统菜单配置表: 不存在则创建, 存在则补充新列并确保 menu_key 唯一 */
    private void migrateMenuTable() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu'",
                Integer.class);
        if (count == null || count == 0) {
            jdbcTemplate.execute(
                    "CREATE TABLE sys_menu ("
                            + "id BIGINT PRIMARY KEY AUTO_INCREMENT, "
                            + "parent_id BIGINT NULL COMMENT '父菜单ID, 顶级为 NULL', "
                            + "menu_key VARCHAR(64) NOT NULL COMMENT '菜单标识, 用于权限判断与前端路由key', "
                            + "name VARCHAR(50) NOT NULL COMMENT '菜单名称', "
                            + "name_en VARCHAR(100) NULL COMMENT '菜单英文名称', "
                            + "path VARCHAR(200) NULL COMMENT '路由路径', "
                            + "component VARCHAR(200) NULL COMMENT '前端组件路径', "
                            + "icon VARCHAR(100) NULL COMMENT '图标', "
                            + "type TINYINT NULL COMMENT '类型: 1=目录 2=菜单 3=按钮', "
                            + "sort_order INT DEFAULT 0 COMMENT '排序', "
                            + "actions TEXT NULL COMMENT '可用操作 JSON数组: [\"view\",\"create\",\"edit\",\"delete\"]', "
                            + "status TINYINT DEFAULT 1 COMMENT '状态: 1=启用 0=停用', "
                            + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                            + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                            + "UNIQUE INDEX uk_menu_key (menu_key)"
                            + ") COMMENT='系统菜单配置表'");
            log.info("已自动创建菜单配置表 sys_menu");
            return;
        }

        // 兼容 01_init_system.sql 旧结构: 补充新列
        addColumnIfAbsent("sys_menu", "menu_key",
                "ALTER TABLE sys_menu ADD COLUMN menu_key VARCHAR(64) NULL COMMENT '菜单标识, 用于权限判断与前端路由key' AFTER parent_id");
        addColumnIfAbsent("sys_menu", "component",
                "ALTER TABLE sys_menu ADD COLUMN component VARCHAR(200) NULL COMMENT '前端组件路径' AFTER path");
        addColumnIfAbsent("sys_menu", "actions",
                "ALTER TABLE sys_menu ADD COLUMN actions TEXT NULL COMMENT '可用操作 JSON数组' AFTER sort_order");
        addColumnIfAbsent("sys_menu", "updated_by",
                "ALTER TABLE sys_menu ADD COLUMN updated_by VARCHAR(64) NULL COMMENT '最后更新人' AFTER status");
        addColumnIfAbsent("sys_menu", "name_en",
                "ALTER TABLE sys_menu ADD COLUMN name_en VARCHAR(100) NULL COMMENT '菜单英文名称' AFTER name");

        // 为存量数据生成 menu_key, 避免后续非空约束与唯一索引失败
        jdbcTemplate.update(
                "UPDATE sys_menu SET menu_key = CONCAT('menu_', id) "
                        + "WHERE menu_key IS NULL OR menu_key = ''");
        // 处理可能存在的 menu_key 重复(保留 id 最小者)
        jdbcTemplate.update(
                "UPDATE sys_menu m2 JOIN sys_menu m1 ON m1.id < m2.id AND m1.menu_key = m2.menu_key "
                        + "SET m2.menu_key = CONCAT(m2.menu_key, '_', m2.id)");

        jdbcTemplate.update(
                "ALTER TABLE sys_menu MODIFY COLUMN menu_key VARCHAR(64) NOT NULL "
                        + "COMMENT '菜单标识, 用于权限判断与前端路由key'");

        Integer indexCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.STATISTICS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_menu' AND INDEX_NAME = 'uk_menu_key'",
                Integer.class);
        if (indexCount == null || indexCount == 0) {
            jdbcTemplate.execute("ALTER TABLE sys_menu ADD UNIQUE INDEX uk_menu_key (menu_key)");
        }
        seedMenuEnglishNames();
    }

    /** 菜单多语言: 按 menu_key 回填英文名称 (仅填充未配置的, 不覆盖人工修改), 与 sql/18_menu_i18n.sql 保持一致 */
    private void seedMenuEnglishNames() {
        Map<String, String> enNames = Map.ofEntries(
                Map.entry("home", "Home"),
                Map.entry("merchant_group", "Merchant Group"),
                Map.entry("merchant-group-list", "Group Management"),
                Map.entry("store-list", "Store Management"),
                Map.entry("merchant_promotion", "Merchant Promotion Tools"),
                Map.entry("promotion-dashboard", "Dashboard"),
                Map.entry("promotion-algorithm", "Algorithm Library"),
                Map.entry("promotion-slot-config", "Feed Strategy"),
                Map.entry("promotion-waterfall", "Sales Pricing"),
                Map.entry("gift-manage", "Gift Management"),
                Map.entry("gift-detail", "Promotion Gifts"),
                Map.entry("gift-consume-detail", "Consumption Details"),
                Map.entry("ad-sales", "Ad Sales"),
                Map.entry("promotion-word-library", "Word Library"),
                Map.entry("traffic-sandbox", "Experiment Sandbox"),
                Map.entry("waterfall-simulation", "Waterfall Simulation"),
                Map.entry("algorithm-simulation", "Algorithm Simulation"),
                Map.entry("merchant-score-insight", "Merchant Score Insight"),
                Map.entry("merchant-promotion-diagnose", "Promotion Diagnosis"),
                Map.entry("promotion-tool", "Promotion Pass"),
                Map.entry("promotion_tool", "Promotion Pass"),
                Map.entry("promotion-sales-config", "Store Promotion"),
                Map.entry("promotion-report-group", "Report Analysis"),
                Map.entry("promotion-report-overview", "Overview"),
                Map.entry("promotion-report-order", "Order Report"),
                Map.entry("promotion-report-compare", "Type Comparison"),
                Map.entry("search", "Search Management"),
                Map.entry("search-config-new", "Search Config"),
                Map.entry("global-config", "Global Config"),
                Map.entry("channel-strategy", "Dimension Strategy"),
                Map.entry("search-guide", "Search Guide"),
                Map.entry("hint-config", "Hint Config"),
                Map.entry("hot-search-config", "Hot Search Config"),
                Map.entry("search-weight-config", "Weight Control"),
                Map.entry("search-library", "Search Library"),
                Map.entry("word-segmentation", "Word Segmentation"),
                Map.entry("synonym-config", "Synonym Library"),
                Map.entry("hot-search-library", "Hot Search Library"),
                Map.entry("stop-words", "Stop Words"),
                Map.entry("search-verify-group", "Verification"),
                Map.entry("search-verify", "Search Verify"),
                Map.entry("hint-verify", "Hint Verify"),
                Map.entry("hot-search-verify", "Hot Search Verify"),
                Map.entry("report", "Reports"),
                Map.entry("hint-report", "Hint Report"),
                Map.entry("hot-search-report", "Hot Search Report"),
                Map.entry("finance", "Finance"),
                Map.entry("promotion", "Promotion Funds"),
                Map.entry("account-balance", "Account Balance"),
                Map.entry("consume-risk", "Consumption Risk"),
                Map.entry("batch-query", "Batch Query"),
                Map.entry("detail-query", "Detail Query"),
                Map.entry("merchant-reconcile", "Merchant Reconciliation"),
                Map.entry("writeoff-reconcile", "Write-off Reconciliation"),
                Map.entry("debt-reconcile", "Debt Reconciliation"),
                Map.entry("approval", "Approval Management"),
                Map.entry("approval-center", "Approval Center"),
                Map.entry("hr", "Group HR"),
                Map.entry("employee-management", "Employee Management"),
                Map.entry("organization-management", "Organization"),
                Map.entry("position-management", "Position"),
                Map.entry("login-log", "Employee Activity"),
                // 團購管理
                Map.entry("group-purchase", "Group Purchase"),
                Map.entry("group-purchase-dashboard", "Flash Sale Overview"),
                Map.entry("flash-sale-register", "Flash Sale Register"),
                Map.entry("flash-sale-stats", "Flash Sale Stats"),
                Map.entry("flash-sale-price", "Macau Flash Sale Price"),
                Map.entry("permission", "Permission Management"),
                Map.entry("role-management", "Role Management"),
                Map.entry("function-permission", "Function Authorization"),
                Map.entry("data-permission", "Data Authorization"),
                Map.entry("oa-center", "OA Center"),
                Map.entry("oa-requests", "Workflow Items"),
                Map.entry("process-center", "Process Center"),
                Map.entry("system-config", "System Config"),
                Map.entry("menu-config", "Menu Config"),
                Map.entry("translation-manage", "Translation Config"),
                Map.entry("rule-config", "Rule Config"),
                Map.entry("workflow-config", "Workflow Config"),
                Map.entry("version-history", "Version History"),
                Map.entry("merchant-order-manage", "Order Management"),
                Map.entry("ai-assistant", "AI Center (AI)"),
                Map.entry("ai_model_hub", "Model Access"),
                Map.entry("ai_quota_auth", "Authorization & Quota"),
                Map.entry("ai-operation-auth", "AI Operation Authorization"),
                Map.entry("ai_usage_stats", "Energy Statistics"),
                Map.entry("ai_energy_detail", "Energy Detail"),
                Map.entry("ai_energy_control", "Energy Control"),
                Map.entry("ai-energy-billing", "Energy & Billing"),
                Map.entry("ai-mcp-service", "MCP Services"),
                Map.entry("ai-access-request", "AI Access Application"),
                Map.entry("ai-conversation-audit", "Conversation Audit"),
                Map.entry("ai-emp-permission", "Employee AI Quota Overview"));
        for (Map.Entry<String, String> entry : enNames.entrySet()) {
            jdbcTemplate.update(
                    "UPDATE sys_menu SET name_en = ? WHERE menu_key = ? AND (name_en IS NULL OR name_en = '')",
                    entry.getValue(), entry.getKey());
        }
    }

    /**
     * 一次性調整 (隨 V_MENU_SEED v6 執行):
     * - 新增「能耗與賬單」二级目录，将能耗統計/能耗明細降级为三级
     * - 硬删除 ai_energy_control 菜单及角色/部门关联权限（seedSystemMenus 只增不删，需在此显式清理）
     */
    private void adjustAiCenterMenus() {
        jdbcTemplate.update("UPDATE sys_menu SET name_en = 'AI Center (AI)' WHERE menu_key = 'ai-assistant'");
        // 新增「能耗與賬單」二级目录，将能耗統計/能耗明細降级为三级
        Long billingId = queryMenuIdByKey("ai-energy-billing");
        Long assistantId = queryMenuIdByKey("ai-assistant");
        if (billingId == null && assistantId != null) {
            jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted) "
                + "VALUES (?, 'ai-energy-billing', '能耗與賬單', NULL, NULL, 'ThunderboltOutlined', 1, 5, '[\"view\"]', 1, 'system', 0)",
                assistantId);
            billingId = queryMenuIdByKey("ai-energy-billing");
            log.info("已新增能耗與賬單目录菜单 (id={})", billingId);
        }
        if (billingId != null) {
            jdbcTemplate.update("UPDATE sys_menu SET parent_id = ?, sort_order = 1, name_en = 'Energy Statistics' WHERE menu_key = 'ai_usage_stats' AND parent_id != ?", billingId, billingId);
            jdbcTemplate.update("UPDATE sys_menu SET parent_id = ?, sort_order = 2, name_en = 'Energy Detail' WHERE menu_key = 'ai_energy_detail' AND parent_id != ?", billingId, billingId);
            jdbcTemplate.update("UPDATE sys_menu SET name_en = 'Energy & Billing' WHERE menu_key = 'ai-energy-billing' AND (name_en IS NULL OR name_en = '')");
        }
        // 删除能耗管控菜单及关联权限
        Long controlId = queryMenuIdByKey("ai_energy_control");
        if (controlId != null) {
            jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id = ?", controlId);
            jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id = ?", controlId);
            jdbcTemplate.update("DELETE FROM sys_menu WHERE id = ?", controlId);
            log.info("已删除无用的能耗管控菜单 (id={})", controlId);
        }
        // v16: 设置 OA 中心图标，修正 permission/system-config 排序
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'SolutionOutlined' WHERE menu_key = 'oa-center' AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'FileTextOutlined' WHERE menu_key = 'oa-requests' AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'AppstoreOutlined' WHERE menu_key = 'process-center' AND (icon IS NULL OR icon = '')");
        // v21: 对齐开发环境顶级菜单顺序（智能中心AI=7, 團購管理=8, 集團人事=9, 物資管理=10, OA中心=11, 權限管理=12, 系統配置=13）
        // 生产库曾由 71_fix_menu_tree_structure.sql 将 group-purchase 设为 7 且 seedSystemMenus 不覆盖已有排序，需强制纠正
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 7 WHERE menu_key = 'ai-assistant' AND sort_order != 7");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 8 WHERE menu_key = 'group-purchase' AND sort_order != 8");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 9 WHERE menu_key = 'hr' AND sort_order != 9");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 10 WHERE menu_key = 'asset-management' AND sort_order != 10");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 11 WHERE menu_key = 'oa-center' AND sort_order != 11");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 12 WHERE menu_key = 'permission' AND sort_order != 12");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 13 WHERE menu_key = 'system-config' AND sort_order != 13");
        // v22: OA中心子菜单排序修正（107 SQL 曾将 process-center 插入为 sort=2，导致流程事項排在流程中心前面）
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 1 WHERE menu_key = 'process-center' AND sort_order != 1");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 2 WHERE menu_key = 'oa-requests' AND sort_order != 2");
        jdbcTemplate.update("UPDATE sys_menu SET sort_order = 3 WHERE menu_key = 'workflow-config' AND sort_order != 3");
        // 图标统一（无条件覆盖，前端 Sidebar 图标颜色由 CSS nth-child 按位置着色，顺序正确后颜色自然对齐）
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'RobotOutlined' WHERE menu_key = 'ai-assistant'");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'ShoppingFilled' WHERE menu_key = 'group-purchase'");
        // v23/v24: 物資管理菜單圖標（分組 + 子菜單）
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'InboxOutlined'     WHERE menu_key = 'asset-management' AND (icon IS NULL OR icon = '')");
        // 分組圖標
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'ShoppingCartOutlined' WHERE menu_key = 'asset-purchase' AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'SwapOutlined'       WHERE menu_key = 'asset-flow-ops' AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'ToolOutlined'       WHERE menu_key = 'asset-maintenance' AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'SettingOutlined'    WHERE menu_key = 'asset-basic' AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'DashboardOutlined'  WHERE menu_key = 'asset-dashboard'  AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'AppstoreOutlined'  WHERE menu_key = 'asset-list'      AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'TagsOutlined'      WHERE menu_key = 'asset-category'  AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'BarcodeOutlined'   WHERE menu_key = 'asset-model'     AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'EnvironmentOutlined' WHERE menu_key = 'asset-location' AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'DatabaseOutlined' WHERE menu_key = 'param-library' AND (icon IS NULL OR icon = '')");

        jdbcTemplate.update("UPDATE sys_menu SET icon = 'ImportOutlined'    WHERE menu_key = 'asset-inbound'   AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'UserAddOutlined'    WHERE menu_key = 'asset-claim'     AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'ScheduleOutlined'   WHERE menu_key = 'asset-borrow'    AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'RollbackOutlined'   WHERE menu_key = 'asset-return'    AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'SwapOutlined'      WHERE menu_key = 'asset-transfer-list' AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'TeamOutlined'      WHERE menu_key = 'asset-handover'   AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'ToolOutlined'      WHERE menu_key = 'asset-repair'    AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'DollarOutlined'    WHERE menu_key = 'asset-compensation' AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'DeleteOutlined'    WHERE menu_key = 'asset-scrap'     AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'HistoryOutlined'   WHERE menu_key = 'asset-flow'      AND (icon IS NULL OR icon = '')");
        jdbcTemplate.update("UPDATE sys_menu SET icon = 'AuditOutlined'     WHERE menu_key = 'asset-inventory' AND (icon IS NULL OR icon = '')");
        // v24c: 移除「統計報表」菜單（已與「資產看板」合併）
        jdbcTemplate.update("DELETE FROM sys_role_menu       WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key = 'asset-report')");
        jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key = 'asset-report')");
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' WHERE menu_key = 'asset-report' AND deleted = 0");
        // v24: 清理已合併的孤立子菜單（僅 asset-add / asset-transfer，asset-claim / asset-return 為 v24 獨立頁面）
        jdbcTemplate.update("DELETE FROM sys_role_menu       WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key IN ('asset-add','asset-transfer'))");
        jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key IN ('asset-add','asset-transfer'))");
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' WHERE menu_key IN ('asset-add','asset-transfer') AND deleted = 0");
        // v24b: 恢復被 v23 清理邏輯誤刪的 asset-claim / asset-return
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 0, updated_by = 'system' WHERE menu_key IN ('asset-claim','asset-return') AND deleted = 1");
    }

    /** 角色-菜单权限关联表: 不存在则创建, 存在则补充 actions 列, 并迁移旧 JSON 权限 */
    private void migrateRoleMenuTable() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_role_menu'",
                Integer.class);
        if (count == null || count == 0) {
            jdbcTemplate.execute(
                    "CREATE TABLE sys_role_menu ("
                            + "role_id BIGINT NOT NULL COMMENT '角色ID', "
                            + "menu_id BIGINT NOT NULL COMMENT '菜单ID', "
                            + "actions TEXT NULL COMMENT '允许的操作 JSON数组', "
                            + "PRIMARY KEY (role_id, menu_id)"
                            + ") COMMENT='角色-菜单权限关联表'");
            log.info("已自动创建角色菜单关联表 sys_role_menu");
        } else {
            addColumnIfAbsent("sys_role_menu", "actions",
                    "ALTER TABLE sys_role_menu ADD COLUMN actions TEXT NULL COMMENT '允许的操作 JSON数组'");
        }
        // 旧 JSON 权限迁移由 migrateSchema 在菜单种子化之后统一触发, 避免为未种子菜单创建占位菜单
    }

    /** 部门-菜单权限关联表: 不存在则创建, 并迁移旧 JSON 权限 */
    private void migrateDepartmentMenuTable() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_department_menu'",
                Integer.class);
        if (count == null || count == 0) {
            jdbcTemplate.execute(
                    "CREATE TABLE sys_department_menu ("
                            + "dept_id BIGINT NOT NULL COMMENT '部门ID', "
                            + "menu_id BIGINT NOT NULL COMMENT '菜单ID', "
                            + "actions TEXT NULL COMMENT '允许的操作 JSON数组', "
                            + "PRIMARY KEY (dept_id, menu_id)"
                            + ") COMMENT='部门-菜单权限关联表'");
            log.info("已自动创建部门菜单关联表 sys_department_menu");
        }
        // 旧 JSON 权限迁移由 migrateSchema 在菜单种子化之后统一触发, 避免为未种子菜单创建占位菜单
    }

    /** 数据授权表: 不存在则创建 */
    private void createDataAuthorizationTable() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sys_data_authorization'",
                Integer.class);
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE sys_data_authorization ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "target_type VARCHAR(20) NOT NULL COMMENT '授权对象类型: role / department', "
                        + "target_id BIGINT NOT NULL COMMENT '角色ID 或 部门ID', "
                        + "group_code VARCHAR(50) NOT NULL COMMENT '授权商家集团编码', "
                        + "status TINYINT DEFAULT 1 COMMENT '1=启用 0=停用', "
                        + "created_by VARCHAR(64) NULL COMMENT '创建人', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "UNIQUE KEY uk_target_group (target_type, target_id, group_code)"
                        + ") COMMENT='数据授权表：角色/部门 → 可见商家范围'");
        log.info("已自动创建数据授权表 sys_data_authorization");
    }

    /** 将 sys_role.permissions 旧 JSON 迁移到 sys_role_menu (按角色幂等) */
    private void migrateRolePermissions() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, permissions FROM sys_role "
                        + "WHERE permissions IS NOT NULL AND permissions != '' AND permissions != '[]' "
                        + "AND id NOT IN (SELECT DISTINCT role_id FROM sys_role_menu)");
        if (rows.isEmpty()) {
            return;
        }
        for (Map<String, Object> row : rows) {
            Long roleId = ((Number) row.get("id")).longValue();
            List<MenuPermissionDTO> perms = JsonUtils.parsePermissions((String) row.get("permissions"));
            for (MenuPermissionDTO perm : perms) {
                Long menuId = resolveMenuId(perm.getMenuKey());
                if (menuId == null) {
                    continue;
                }
                jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                        roleId, menuId, JsonUtils.toJson(perm.getActions()));
            }
        }
        log.info("已迁移 {} 个角色的旧版权限到 sys_role_menu", rows.size());
    }

    /** 将 sys_department.permissions 旧 JSON 迁移到 sys_department_menu (按部门幂等) */
    private void migrateDepartmentPermissions() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, permissions FROM sys_department "
                        + "WHERE permissions IS NOT NULL AND permissions != '' AND permissions != '[]' "
                        + "AND id NOT IN (SELECT DISTINCT dept_id FROM sys_department_menu)");
        if (rows.isEmpty()) {
            return;
        }
        for (Map<String, Object> row : rows) {
            Long deptId = ((Number) row.get("id")).longValue();
            List<MenuPermissionDTO> perms = JsonUtils.parsePermissions((String) row.get("permissions"));
            for (MenuPermissionDTO perm : perms) {
                Long menuId = resolveMenuId(perm.getMenuKey());
                if (menuId == null) {
                    continue;
                }
                jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_department_menu (dept_id, menu_id, actions) VALUES (?, ?, ?)",
                        deptId, menuId, JsonUtils.toJson(perm.getActions()));
            }
        }
        log.info("已迁移 {} 个部门的旧版权限到 sys_department_menu", rows.size());
    }

    /** 根据 menuKey 获取菜单ID, 不存在时自动创建占位菜单 */
    private Long resolveMenuId(String menuKey) {
        if (!StringUtils.hasText(menuKey)) {
            return null;
        }
        String key = menuKey.trim();
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, key);
        if (!ids.isEmpty()) {
            return ids.get(0);
        }
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, type, status, deleted, sort_order) "
                        + "VALUES (NULL, ?, ?, 2, 1, 0, 0)",
                key, key);
        Long menuId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        log.info("已为权限菜单标识 [{}] 自动创建占位菜单 (id={})", key, menuId);
        return menuId;
    }

    /** 种子系统菜单：确保前端定义的所有菜单在 sys_menu 中存在 (幂等) */
    private void seedSystemMenus() {
        // v26: 採購申請/採購訂單菜單已遷移至 OA 中心，清理物資管理下的採購菜單
        log.info("开始清理采购申请/采购订单菜单...");
        jdbcTemplate.update("DELETE FROM sys_role_menu       WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key IN ('purchase-request','purchase-order'))");
        jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key IN ('purchase-request','purchase-order'))");
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' WHERE menu_key IN ('purchase-request','purchase-order') AND deleted = 0");

        // 清理 merchant-order-manage 占位菜单（前端 keyToPath 有定义但种子数据遗漏，
        // resolveMenuId 会自动创建 parent_id=NULL 的占位记录，导致菜单树出现孤儿节点）
        log.info("开始清理 merchant-order-manage 占位菜单...");
        jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key = 'merchant-order-manage')");
        jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key = 'merchant-order-manage')");
        jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = 'merchant-order-manage'");

        // 清理旧的 AI 菜单占位数据（为新的层级结构做准备）
        log.info("开始清理旧的 AI 菜单占位数据...");
        jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%')");
        jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id IN (SELECT id FROM sys_menu WHERE menu_key LIKE '%ai%')");
        jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key LIKE '%ai%' OR menu_key = 'ai-assistant'");

        // key -> [name, parentKey|null, sort]
        Map<String, String[]> menus = new LinkedHashMap<>();
        // ── 顶级菜单 ──
        menus.put("home",                new String[]{"首頁",            null,  "1"});
        menus.put("merchant_group",      new String[]{"商戶集團管理",     null,  "2"});
        menus.put("merchant_promotion",  new String[]{"商家推廣工具",      null,  "3"});
        menus.put("promotion_tool",      new String[]{"推廣通",           null,  "4"});
        menus.put("search",              new String[]{"搜索管理",          null,  "5"});
        menus.put("finance",             new String[]{"財務管理",          null,  "6"});
        menus.put("ai-assistant",        new String[]{"智能中心(AI)",     null,  "7"});
        menus.put("group-purchase",      new String[]{"團購管理",          null,  "8"});
        menus.put("hr",                  new String[]{"集團人事",          null,  "9"});
        menus.put("asset-management",    new String[]{"物資管理",          null,  "10"});
        menus.put("oa-center",           new String[]{"OA中心",            null,  "11"});
        menus.put("permission",          new String[]{"權限管理",          null,  "12"});
        menus.put("system-config",       new String[]{"系統配置",          null,  "13"});
        // ── 商戶集團管理 ──
        menus.put("merchant-group-list", new String[]{"集團管理",         "merchant_group",     "1"});
        menus.put("store-list",          new String[]{"門店管理",         "merchant_group",     "2"});
        // ── 商家推廣工具 ──
        menus.put("promotion-dashboard", new String[]{"數據看板",         "merchant_promotion", "1"});
        menus.put("promotion-algorithm", new String[]{"算法庫",           "merchant_promotion", "2"});
        menus.put("promotion-slot-config", new String[]{"瀑布流策略",     "merchant_promotion", "3"});
        menus.put("promotion-waterfall", new String[]{"銷售定價",         "merchant_promotion", "4"});
        menus.put("gift-manage",         new String[]{"贈送管理",         "merchant_promotion", "5"});
        menus.put("ad-sales",            new String[]{"廣告銷售",         "merchant_promotion", "6"});
        menus.put("promotion-word-library", new String[]{"詞庫管理",     "merchant_promotion", "7"});
        menus.put("merchant-order-manage",  new String[]{"訂單管理",     "merchant_promotion", "8"});
        // ── 商家推廣工具 > 流量沙盤 ──
        menus.put("traffic-sandbox",          new String[]{"實驗沙盤",     "merchant_promotion", "9"});
        menus.put("waterfall-simulation",     new String[]{"瀑布流推演",   "traffic-sandbox",    "1"});
        menus.put("algorithm-simulation",     new String[]{"算法推演",     "traffic-sandbox",    "2"});
        menus.put("merchant-score-insight",   new String[]{"商家評分透視", "traffic-sandbox",    "3"});
        menus.put("merchant-promotion-diagnose", new String[]{"商家推廣診斷", "traffic-sandbox", "4"});
        // ── 商家推廣工具 > 贈送管理 ──
        menus.put("gift-detail",         new String[]{"推廣贈送",         "gift-manage",        "1"});
        menus.put("gift-consume-detail", new String[]{"消費明細",         "gift-manage",        "2"});
        // ── 推廣通 ──
        menus.put("promotion-sales-config", new String[]{"店鋪推廣",     "promotion_tool",     "1"});
        menus.put("promotion-report-group", new String[]{"報表分析",     "promotion_tool",     "2"});
        menus.put("promotion-report-overview", new String[]{"數據概覽",  "promotion-report-group", "1"});
        menus.put("promotion-report-order", new String[]{"訂單效果報表", "promotion-report-group", "2"});
        menus.put("promotion-report-compare", new String[]{"推薦類型對比", "promotion-report-group", "3"});
        // ── 搜索管理 ──
        menus.put("search-config-new",   new String[]{"搜索配置",         "search",             "1"});
        menus.put("global-config",       new String[]{"全局配置",         "search-config-new",  "1"});
        menus.put("channel-strategy",    new String[]{"維度策略",         "search-config-new",  "2"});
        menus.put("search-guide",        new String[]{"搜索引導",         "search",             "2"});
        menus.put("hint-config",         new String[]{"底紋配置",         "search-guide",       "1"});
        menus.put("hot-search-config",   new String[]{"熱搜配置",         "search-guide",       "2"});
        menus.put("search-weight-config", new String[]{"權重干預",       "search-guide",       "3"});
        menus.put("search-library",      new String[]{"搜索詞庫",         "search",             "3"});
        menus.put("word-segmentation",   new String[]{"分詞詞庫",         "search-library",     "1"});
        menus.put("synonym-config",      new String[]{"同義詞庫",         "search-library",     "2"});
        menus.put("hot-search-library",  new String[]{"熱搜詞庫",         "search-library",     "3"});
        menus.put("stop-words",          new String[]{"停用詞庫",         "search-library",     "4"});
        menus.put("search-verify-group", new String[]{"效果校驗",         "search",             "4"});
        menus.put("search-verify",       new String[]{"搜索校驗",         "search-verify-group", "1"});
        menus.put("hint-verify",         new String[]{"底紋校驗",         "search-verify-group", "2"});
        menus.put("hot-search-verify",   new String[]{"熱搜校驗",         "search-verify-group", "3"});
        menus.put("report",              new String[]{"報表統計",          "search",             "5"});
        menus.put("hint-report",         new String[]{"底紋報表",         "report",             "1"});
        menus.put("hot-search-report",   new String[]{"熱搜報表",         "report",             "2"});
        // ── 財務管理 ──
        menus.put("promotion",           new String[]{"推廣金管理",       "finance",            "1"});
        menus.put("account-balance",     new String[]{"賬戶餘額",         "promotion",          "1"});
        menus.put("consume-risk",        new String[]{"消費風控",         "promotion",          "4"});
        menus.put("batch-query",         new String[]{"批次查詢",         "promotion",          "2"});
        menus.put("detail-query",        new String[]{"明細查詢",         "promotion",          "3"});
        menus.put("merchant-reconcile",  new String[]{"商戶通對賬",       "finance",            "2"});
        menus.put("writeoff-reconcile",  new String[]{"充消對賬",         "merchant-reconcile", "1"});
        menus.put("debt-reconcile",      new String[]{"欠款對賬",         "merchant-reconcile", "2"});
        menus.put("approval",            new String[]{"審批管理",          "finance",            "3"});
        menus.put("approval-center",     new String[]{"審批中心",         "approval",           "1"});
        // ── 智能中心 (AI)：拆分二级菜单（模型管理、授权与配额） ──
        menus.put("ai-models",            new String[]{"模型管理",      "ai-assistant",    "1"});
        menus.put("ai-model-provider",    new String[]{"供应商管理",    "ai-models",       "1"});
        menus.put("ai-model-list",        new String[]{"模型接入",      "ai-models",       "2"});
        // AI 授权与配额：模型授权管理 / 配额管理 升级二级菜单（直挂智能中心）
        menus.put("ai-auth-manage",       new String[]{"模型授权管理", "ai-assistant",    "2"});
        menus.put("ai-dept-model-auth",   new String[]{"部门模型权控",       "ai-auth-manage",    "1"});
        menus.put("ai-emp-model-auth",    new String[]{"员工模型权控",       "ai-auth-manage",    "2"});
        menus.put("ai-quota-manage",      new String[]{"配额管理",           "ai-assistant",    "3"});
        menus.put("ai-dept-quota",        new String[]{"部门额度",           "ai-quota-manage",   "1"});
        menus.put("ai-emp-quota",         new String[]{"员工额度",           "ai-quota-manage",   "2"});
        menus.put("ai-operation-auth",   new String[]{"AI 操作授權",     "ai-assistant",       "5"});
        menus.put("ai-energy-billing",   new String[]{"能耗與賬單",     "ai-assistant",       "6"});
        menus.put("ai_usage_stats",      new String[]{"能耗統計",       "ai-energy-billing",  "1"});
        menus.put("ai_energy_detail",    new String[]{"能耗明細",       "ai-energy-billing",  "2"});
        menus.put("ai-mcp-service",      new String[]{"MCP 服務",       "ai-assistant",       "7"});
        menus.put("ai-emp-permission",   new String[]{"員工AI權額管理",     "ai-assistant",       "4"});
        // 與 102_ai_access_request_menu.sql 同源：併入主種子，防止 '%ai%' 清理後獨立初始化器不重跑導致菜單丟失
        menus.put("ai-access-request",   new String[]{"AI 使用申請",    "ai-assistant",      "10"});
        menus.put("ai-conversation-audit", new String[]{"对话审计",     "ai-assistant",       "8"});
        // ── 團購管理 ──
        menus.put("group-purchase-dashboard", new String[]{"秒殺數據總覽",     "group-purchase",      "1"});
        menus.put("flash-sale-register", new String[]{"秒殺商品登記",     "group-purchase",      "2"});
        menus.put("flash-sale-stats",   new String[]{"秒殺商品統計",     "group-purchase",      "3"});
        menus.put("flash-sale-price",   new String[]{"澳覓秒殺價",       "group-purchase",      "4"});
        // ── 集團人事 ──
        menus.put("employee-management", new String[]{"員工管理",         "hr",                 "1"});
        menus.put("organization-management", new String[]{"組織管理",     "hr",                 "2"});
        menus.put("position-management", new String[]{"職位管理",         "hr",                 "3"});
        menus.put("login-log",           new String[]{"員工動態",         "hr",                 "4"});
        // ── 物資管理（EAM 分組子菜單）──
        // 二級直達菜單（無分組）
        menus.put("asset-dashboard",    new String[]{"資產看板",         "asset-management",   "1"});
        // 二級分組
        menus.put("asset-purchase",    new String[]{"採購入庫",         "asset-management",   "2"});
        menus.put("asset-flow-ops",    new String[]{"資產管理",         "asset-management",   "3"});
        menus.put("asset-maintenance", new String[]{"維護與處置",       "asset-management",   "4"});
        menus.put("asset-basic",       new String[]{"基礎設置",         "asset-management",   "5"});
        // 三級菜單 → 採購入庫
        menus.put("purchase-order",     new String[]{"採購訂單",         "asset-purchase",     "1"});
        menus.put("asset-inbound",      new String[]{"驗收入庫",         "asset-purchase",     "2"});
        // 三級菜單 → 資產管理
        menus.put("asset-list",         new String[]{"資產台賬",         "asset-flow-ops",     "1"});
        menus.put("asset-claim",        new String[]{"領用歸還",         "asset-flow-ops",     "2"});
        menus.put("asset-borrow",       new String[]{"借用管理",         "asset-flow-ops",     "3"});
        menus.put("asset-return",       new String[]{"歸還管理",         "asset-flow-ops",     "4"});
        menus.put("asset-transfer-list",new String[]{"調撥管理",         "asset-flow-ops",     "5"});
        menus.put("asset-handover",     new String[]{"交接管理",         "asset-flow-ops",     "6"});
        // 三級菜單 → 維護與處置
        menus.put("asset-repair",       new String[]{"維修管理",         "asset-maintenance",  "1"});
        menus.put("asset-compensation", new String[]{"損壞賠付",         "asset-maintenance",  "2"});
        menus.put("asset-scrap",        new String[]{"資產報廢",         "asset-maintenance",  "3"});
        menus.put("asset-inventory",    new String[]{"資產盤點",         "asset-maintenance",  "4"});
        menus.put("asset-flow",         new String[]{"變更歷史",         "asset-maintenance",  "5"});
        // 三級菜單 → 基礎設置
        menus.put("asset-category",     new String[]{"資產分類",         "asset-basic",        "1"});
        menus.put("asset-model",        new String[]{"資產型號",         "asset-basic",        "2"});
        menus.put("asset-location",     new String[]{"倉庫維護",         "asset-basic",        "3"});
        menus.put("param-library",      new String[]{"參數庫",           "asset-basic",        "4"});
        // ── OA中心 ──
        menus.put("process-center",     new String[]{"流程中心",         "oa-center",         "1"});
        menus.put("oa-requests",        new String[]{"流程中心",         "oa-center",         "2"});
        menus.put("workflow-config",     new String[]{"流程配置",         "oa-center",         "3"});
        // ── 權限管理 ──
        menus.put("role-management",     new String[]{"角色管理",         "permission",         "1"});
        menus.put("function-permission", new String[]{"功能授權",         "permission",         "2"});
        menus.put("data-permission",     new String[]{"數據授權",         "permission",         "3"});
        // ── 系統配置 ──
        menus.put("menu-config",         new String[]{"菜單配置",         "system-config",      "1"});
        menus.put("translation-manage",  new String[]{"多語言配置",         "system-config",      "2"});
        menus.put("rule-config",         new String[]{"規則配置",         "system-config",      "3"});
        menus.put("version-history",    new String[]{"版本管理",         "system-config",      "4"});

        int created = 0;
        int updated = 0;
        for (Map.Entry<String, String[]> entry : menus.entrySet()) {
            String menuKey = entry.getKey();
            String name = entry.getValue()[0];
            String parentKey = entry.getValue()[1];
            int sort = Integer.parseInt(entry.getValue()[2]);

            Long existing = queryMenuIdByKey(menuKey);

            // 计算正确的 parentId
            Long parentId = null;
            if (parentKey != null) {
                parentId = queryMenuIdByKey(parentKey);
                if (parentId == null) {
                    log.warn("种子菜单 [{}]: 父菜单 [{}] 不存在, 跳过", menuKey, parentKey);
                    continue;
                }
            }

            if (existing != null) {
                // 修复占位数据（resolveMenuId 自动创建的记录）的 parent_id / sort_order；
                // 名称仅在确为占位（空/null/等于 menu_key/menu_ 前缀）时才修正，
                // 用户通过「菜单配置」自定义的名称不会被种子覆盖
                Map<String, Object> row = jdbcTemplate.queryForList(
                        "SELECT name, parent_id, sort_order FROM sys_menu WHERE id = ?", existing)
                        .stream().findFirst().orElse(null);
                if (row != null) {
                    String curName = (String) row.get("name");
                    Number curParentRaw = (Number) row.get("parent_id");
                    Long curParentId = curParentRaw != null ? curParentRaw.longValue() : null;
                    // 判断当前名称是否为占位数据（由 resolveMenuId 自动创建）
                    boolean nameIsPlaceholder = curName == null || curName.isEmpty()
                            || curName.equals(menuKey)
                            || curName.startsWith("menu_");
                    boolean needsNameFix = nameIsPlaceholder && !name.equals(curName);
                    boolean needsParentFix = !java.util.Objects.equals(curParentId, parentId);
                    if (needsNameFix || needsParentFix) {
                        String finalName = needsNameFix ? name : curName;
                        jdbcTemplate.update(
                                "UPDATE sys_menu SET name = ?, parent_id = ?, sort_order = ? WHERE id = ?",
                                finalName, parentId, sort, existing);
                        updated++;
                    }
                }
                continue;
            }

            // 清理同 menu_key 的软删除残留记录，避免唯一键 uk_menu_key 冲突
            jdbcTemplate.update("DELETE FROM sys_menu WHERE menu_key = ? AND deleted = 1", menuKey);

            if (parentId != null) {
                jdbcTemplate.update(
                        "INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted) "
                                + "VALUES (?, ?, ?, 2, ?, 1, 0)",
                        parentId, menuKey, name, sort);
            } else {
                jdbcTemplate.update(
                        "INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, status, deleted) "
                                + "VALUES (NULL, ?, ?, 1, ?, 1, 0)",
                        menuKey, name, sort);
            }
            created++;
        }
        if (created > 0) {
            log.info("已种子化 {} 个系统菜单到 sys_menu", created);
        }
        // 確保 admin 角色持有全部種子菜單權限（幂等）；並回填歷史授權中缺失的 actions——
        // actions 為空會導致「功能角色登錄（非 sys_user.role=admin）」的用戶 hasMenuPermission 判定失敗，菜單不可見/不可進
        ensureAdminMenuGrants(menus);
        if (updated > 0) {
            log.info("已修正 {} 个系统菜单的名称/层级/排序", updated);
        }


    }

    /** 修复转账/合并流程批次号唯一约束：从 (batch_no) 改为 (batch_no, group_code) */
    private void fixFinBatchUniqueKey() {
        try {
            // 检查旧索引是否存在
            Integer oldIdx = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.STATISTICS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_batch' AND INDEX_NAME = 'uk_fin_batch_no'",
                    Integer.class);
            if (oldIdx != null && oldIdx > 0) {
                jdbcTemplate.execute("ALTER TABLE biz_fin_batch DROP INDEX uk_fin_batch_no");
                jdbcTemplate.execute("ALTER TABLE biz_fin_batch ADD UNIQUE KEY uk_fin_batch_no_group (batch_no, group_code)");
                log.info("已修复 biz_fin_batch 唯一约束: (batch_no) → (batch_no, group_code)");
            }
        } catch (Exception e) {
            log.warn("修复 biz_fin_batch 唯一约束时出错: {}", e.getMessage());
        }
    }

    /**
     * 确保「物資管理」一级菜单及其子菜单在数据库中存在（幂等）。
     * 防止 seedSystemMenus 版本已固化但数据库被回滚/手动删除导致菜单丢失。
     */
    private void ensureAssetManagementMenu() {
        if (queryMenuIdByKey("asset-management") != null) {
            return;
        }
        log.info("检测到物资管理菜单缺失，开始重建...");
        // 一级菜单：物資管理
        jdbcTemplate.update(
                "INSERT INTO sys_menu (parent_id, menu_key, name, icon, type, sort_order, actions, status, updated_by, deleted) "
                        + "VALUES (NULL, 'asset-management', '物資管理', 'InboxOutlined', 1, 10, '[\"view\"]', 1, 'system', 0)");
        Long parentId = queryMenuIdByKey("asset-management");
        if (parentId == null) return;
        // 二级子菜单
        String[][] children = {
                {"asset-list",      "資產台賬",   "AppstoreOutlined",    "1"},
                {"asset-add",       "資產入庫",   "AppstoreAddOutlined", "2"},
                {"asset-claim",     "領用歸還",   "UserAddOutlined",     "3"},
                {"asset-transfer",  "資產轉移",   "SwapOutlined",        "4"},
                {"asset-return",    "資產歸還",   "RollbackOutlined",    "5"},
                {"asset-scrap",     "資產報廢",   "DeleteOutlined",      "6"},
                {"asset-repair",    "資產維修",   "ToolOutlined",        "7"},
                {"asset-inventory", "資產盤點",   "AuditOutlined",       "8"},
        };
        String actions = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
        for (String[] child : children) {
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, path, component, icon, type, sort_order, actions, status, updated_by, deleted) "
                            + "VALUES (?, ?, ?, ?, ?, ?, 2, ?, ?, 1, 'system', 0)",
                    parentId, child[0], child[1], "/" + child[0], child[0], child[2],
                    Integer.parseInt(child[3]), actions);
        }
        // 为 admin 角色补齐授权
        Long adminRoleId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class);
        if (adminRoleId != null) {
            String adminActions = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
            jdbcTemplate.update(
                    "INSERT INTO sys_role_menu (role_id, menu_id, actions) "
                            + "SELECT ?, m.id, ? FROM sys_menu m WHERE m.menu_key = 'asset-management' AND m.deleted = 0 "
                            + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                    adminRoleId, adminActions);
            for (String[] child : children) {
                jdbcTemplate.update(
                        "INSERT INTO sys_role_menu (role_id, menu_id, actions) "
                                + "SELECT ?, m.id, ? FROM sys_menu m WHERE m.menu_key = ? AND m.deleted = 0 "
                                + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                        adminRoleId, adminActions, child[0]);
            }
        }
        log.info("物资管理菜单重建完成");
    }

    /**
     * 物資管理菜單分組重構強制修正（幂等，每次启动确保结构正确）
     * 1. 删除旧 asset-overview 分组
     * 2. 资产看板改为直达二级菜单
     * 3. 分组排序: 采购入库(2) → 资产管理(3) → 维护与处置(4) → 基础设置(5)
     * 4. 确保采购订单存在并挂在采购入库下
     */
    private void fixAssetMenuGrouping() {
        Long assetMgrId = queryMenuIdByKey("asset-management");
        if (assetMgrId == null) return;

        // 1. 软删除旧的 asset-overview 分组
        jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' WHERE menu_key = 'asset-overview' AND deleted = 0");

        // 2. 資產看板改為直達二級菜單（parent 指向 asset-management，sort=1）
        jdbcTemplate.update(
                "UPDATE sys_menu SET parent_id = ?, sort_order = 1 WHERE menu_key = 'asset-dashboard' AND deleted = 0",
                assetMgrId);

        // 3. 分組排序修正
        Long purchaseId = queryMenuIdByKey("asset-purchase");
        Long flowOpsId  = queryMenuIdByKey("asset-flow-ops");
        Long maintId     = queryMenuIdByKey("asset-maintenance");
        Long basicId     = queryMenuIdByKey("asset-basic");
        if (purchaseId != null) jdbcTemplate.update("UPDATE sys_menu SET sort_order = 2 WHERE id = ?", purchaseId);
        if (flowOpsId  != null) jdbcTemplate.update("UPDATE sys_menu SET sort_order = 3 WHERE id = ?", flowOpsId);
        if (maintId    != null) jdbcTemplate.update("UPDATE sys_menu SET sort_order = 4 WHERE id = ?", maintId);
        if (basicId    != null) jdbcTemplate.update("UPDATE sys_menu SET sort_order = 5 WHERE id = ?", basicId);

        // 4. 確保採購訂單存在並掛在採購入庫下
        if (purchaseId != null) {
            // 使用 ON DUPLICATE KEY UPDATE 兼容已存在但 deleted=1 的旧记录
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, icon, status, deleted, updated_by) "
                            + "VALUES (?, 'purchase-order', '採購訂單', 2, 1, 'FileDoneOutlined', 1, 0, 'system') "
                            + "ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), deleted = 0, sort_order = 1, updated_by = 'system'",
                    purchaseId);
            // 给 admin 角色授权
            Long adminRoleId2 = jdbcTemplate.queryForObject(
                    "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class);
            if (adminRoleId2 != null) {
                Long poMenuId = jdbcTemplate.queryForObject(
                        "SELECT id FROM sys_menu WHERE menu_key = 'purchase-order' LIMIT 1", Long.class);
                if (poMenuId != null) {
                    jdbcTemplate.update(
                            "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                            adminRoleId2, poMenuId, "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]");
                }
            }
            // 验收入库排序=2
            jdbcTemplate.update("UPDATE sys_menu SET sort_order = 2 WHERE menu_key = 'asset-inbound' AND deleted = 0 AND parent_id = ?", purchaseId);
        }

        // 5. 确保 asset-dashboard 的 admin 授权
        Long adminRoleId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class);
        if (adminRoleId != null) {
            Long dashId = queryMenuIdByKey("asset-dashboard");
            if (dashId != null) {
                jdbcTemplate.update(
                        "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                        adminRoleId, dashId, "[\"view\"]");
            }
        }

        // 6. 确保 param-library 菜单存在并挂在 asset-basic 下
        if (basicId != null) {
            jdbcTemplate.update(
                    "INSERT INTO sys_menu (parent_id, menu_key, name, type, sort_order, icon, status, deleted, updated_by) "
                            + "VALUES (?, 'param-library', '參數庫', 2, 4, 'DatabaseOutlined', 1, 0, 'system') "
                            + "ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), deleted = 0, sort_order = 4, updated_by = 'system'",
                    basicId);
            // 给 admin 角色授权
            Long adminRoleId2 = jdbcTemplate.queryForObject(
                    "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class);
            if (adminRoleId2 != null) {
                Long plMenuId = jdbcTemplate.queryForObject(
                        "SELECT id FROM sys_menu WHERE menu_key = 'param-library' LIMIT 1", Long.class);
                if (plMenuId != null) {
                    jdbcTemplate.update(
                            "INSERT IGNORE INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?)",
                            adminRoleId2, plMenuId, "[\"view\",\"create\",\"edit\",\"delete\"]");
                }
            }
        }
    }

    /**
     * 确保 admin 角色持有全部种子菜单权限（幂等）。
     * 使用 ON DUPLICATE KEY UPDATE + CASE 仅回填 actions 为空的旧授权，
     * 不覆盖已有的非空 actions（保留角色管理页面的自定义配置）。
     * actions 为空会导致功能角色登录（非 sys_user.role=admin）的用户菜单不可见/不可进。
     */
    private void ensureAdminMenuGrants(Map<String, String[]> menus) {
        Long adminRoleId = jdbcTemplate.queryForObject(
                "SELECT id FROM sys_role WHERE code = 'admin' LIMIT 1", Long.class);
        if (adminRoleId == null) {
            return;
        }
        String defaultActions = "[\"view\",\"create\",\"edit\",\"delete\",\"export\"]";
        for (String menuKey : menus.keySet()) {
            Long menuId = queryMenuIdByKey(menuKey);
            if (menuId == null) {
                continue;
            }
            jdbcTemplate.update(
                    "INSERT INTO sys_role_menu (role_id, menu_id, actions) VALUES (?, ?, ?) "
                            + "ON DUPLICATE KEY UPDATE actions = CASE "
                            + "WHEN actions IS NULL OR actions = '' OR actions = '[]' THEN VALUES(actions) "
                            + "ELSE actions END",
                    adminRoleId, menuId, defaultActions);
        }
    }

    /** 根据 menu_key 查询菜单ID (不存在返回 null) */
    private Long queryMenuIdByKey(String menuKey) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 0 LIMIT 1",
                Long.class, menuKey);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * 确保所有部门拥有 ad-sales 菜单权限，并授权全量商家数据范围。
     * <p>
     * "活"逻辑: 新增部门/新增商家集团时需自动补齐授权, 每次启动执行;
     * 已改为集合式单条 SQL, 无新增数据时仅 3 条查询开销。
     */
    private void ensureDeptAdSalesPermission() {
        String actions = "[\"view\",\"create\",\"edit\",\"export\"]";
        // 1) 菜单权限: 为所有有效部门补齐 ad-sales 菜单授权 (单条集合 SQL 替代逐部门循环)
        Long menuId = queryMenuIdByKey("ad-sales");
        if (menuId != null) {
            jdbcTemplate.update(
                    "INSERT INTO sys_department_menu (dept_id, menu_id, actions) "
                            + "SELECT d.id, ?, ? FROM sys_department d WHERE d.deleted = 0 AND d.status = 1 "
                            + "ON DUPLICATE KEY UPDATE actions = VALUES(actions)",
                    menuId, actions);
        }
        // 2) 数据范围授权: 部门 × 商家集团 全量补齐 (单条集合 SQL 替代双层循环, 幂等)
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_data_authorization (target_type, target_id, group_code, status, deleted) "
                        + "SELECT 'department', d.id, g.group_code, 1, 0 "
                        + "FROM sys_department d "
                        + "CROSS JOIN (SELECT DISTINCT group_code FROM biz_merchant_group "
                        + "WHERE deleted = 0 AND group_code IS NOT NULL AND group_code != '') g "
                        + "WHERE d.deleted = 0 AND d.status = 1");
        if (inserted > 0) {
            log.info("已补充 {} 条部门-商家集团数据授权记录", inserted);
        }
    }

    /**
     * OA 中心表自动创建 (108_oa_process.sql 等效, 幂等)
     * 包含 biz_oa_process, biz_oa_request, biz_oa_approval_task 共 3 张表
     * 以及流程类型种子数据和编号规则
     */
    private void migrateOaTables() {
        // 1. 流程定义表
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS biz_oa_process ("
            + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',"
            + "process_code VARCHAR(32) NOT NULL COMMENT '流程编码',"
            + "process_name VARCHAR(64) NOT NULL COMMENT '流程名称',"
            + "category VARCHAR(32) NOT NULL DEFAULT 'general' COMMENT '分类: office/finance/hr/general',"
            + "icon VARCHAR(64) DEFAULT NULL COMMENT '图标标识',"
            + "description VARCHAR(200) DEFAULT NULL COMMENT '流程说明',"
            + "workflow_type VARCHAR(32) DEFAULT NULL COMMENT '关联 biz_workflow_config.flow_type',"
            + "form_schema TEXT DEFAULT NULL COMMENT '表单字段定义JSON',"
            + "sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',"
            + "status TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',"
            + "UNIQUE KEY uk_oa_process_code (process_code)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA流程定义表'");

        // 2. 流程实例表（统一存储所有审批数据：财务/赠送/AI/OA）
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS biz_oa_request ("
            + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',"
            + "flow_no VARCHAR(32) NOT NULL COMMENT '流程编号',"
            + "process_code VARCHAR(32) NOT NULL COMMENT '关联流程定义编码',"
            + "title VARCHAR(200) NOT NULL COMMENT '流程标题',"
            + "form_data TEXT DEFAULT NULL COMMENT '表单数据JSON',"
            + "applicant VARCHAR(64) NOT NULL COMMENT '申请人',"
            + "flow_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected/cancelled',"
            + "current_node_name VARCHAR(64) DEFAULT NULL COMMENT '当前待审节点名称',"
            + "current_approver VARCHAR(64) DEFAULT NULL COMMENT '当前审批人',"
            + "reject_reason VARCHAR(500) DEFAULT NULL COMMENT '驳回理由',"
            + "apply_time DATETIME DEFAULT NULL COMMENT '申请时间',"
            + "complete_time DATETIME DEFAULT NULL COMMENT '完成时间',"
            + "cancel_time DATETIME DEFAULT NULL COMMENT '撤销时间',"
            // 审批中心专用字段
            + "group_id VARCHAR(32) DEFAULT NULL COMMENT '集团ID',"
            + "group_name VARCHAR(64) DEFAULT NULL COMMENT '集团名称',"
            + "brand VARCHAR(16) DEFAULT NULL COMMENT '品牌: 1=闪蜂 2=mFood',"
            + "biz_approver VARCHAR(64) DEFAULT NULL COMMENT '业务主管-审批人',"
            + "biz_approve_time DATETIME DEFAULT NULL COMMENT '业务主管-审批时间',"
            + "biz_approve_status VARCHAR(16) DEFAULT NULL COMMENT '业务主管-审批状态: pending/approved/rejected',"
            + "ops_approver VARCHAR(64) DEFAULT NULL COMMENT '运营主管-审批人',"
            + "ops_approve_time DATETIME DEFAULT NULL COMMENT '运营主管-审批时间',"
            + "ops_approve_status VARCHAR(16) DEFAULT NULL COMMENT '运营主管-审批状态: pending/approved/rejected',"
            + "fin_approver VARCHAR(64) DEFAULT NULL COMMENT '财务主管-审批人',"
            + "fin_approve_time DATETIME DEFAULT NULL COMMENT '财务主管-审批时间',"
            + "fin_approve_status VARCHAR(16) DEFAULT NULL COMMENT '财务主管-审批状态: pending/approved/rejected',"
            + "deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',"
            + "UNIQUE KEY uk_oa_request_flow_no (flow_no),"
            + "KEY idx_oa_request_applicant (applicant),"
            + "KEY idx_oa_request_status (flow_status),"
            + "KEY idx_oa_request_process (process_code),"
            + "KEY idx_oa_request_group (group_id)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA流程实例表（统一审批数据）'");

        // 2.1 为已存在的 biz_oa_request 表补列（幂等：忽略已存在的列）
        addColumnIfNotExists("biz_oa_request", "current_approver", "VARCHAR(64) DEFAULT NULL COMMENT '当前审批人' AFTER current_node_name");
        addColumnIfNotExists("biz_oa_request", "group_id", "VARCHAR(32) DEFAULT NULL COMMENT '集团ID' AFTER cancel_time");
        addColumnIfNotExists("biz_oa_request", "group_name", "VARCHAR(64) DEFAULT NULL COMMENT '集团名称' AFTER group_id");
        addColumnIfNotExists("biz_oa_request", "brand", "VARCHAR(16) DEFAULT NULL COMMENT '品牌: 1=闪蜂 2=mFood' AFTER group_name");
        addColumnIfNotExists("biz_oa_request", "biz_approver", "VARCHAR(64) DEFAULT NULL COMMENT '业务主管-审批人' AFTER brand");
        addColumnIfNotExists("biz_oa_request", "biz_approve_time", "DATETIME DEFAULT NULL COMMENT '业务主管-审批时间' AFTER biz_approver");
        addColumnIfNotExists("biz_oa_request", "biz_approve_status", "VARCHAR(16) DEFAULT NULL COMMENT '业务主管-审批状态' AFTER biz_approve_time");
        addColumnIfNotExists("biz_oa_request", "ops_approver", "VARCHAR(64) DEFAULT NULL COMMENT '运营主管-审批人' AFTER biz_approve_status");
        addColumnIfNotExists("biz_oa_request", "ops_approve_time", "DATETIME DEFAULT NULL COMMENT '运营主管-审批时间' AFTER ops_approver");
        addColumnIfNotExists("biz_oa_request", "ops_approve_status", "VARCHAR(16) DEFAULT NULL COMMENT '运营主管-审批状态' AFTER ops_approve_time");
        addColumnIfNotExists("biz_oa_request", "fin_approver", "VARCHAR(64) DEFAULT NULL COMMENT '财务主管-审批人' AFTER ops_approve_status");
        addColumnIfNotExists("biz_oa_request", "fin_approve_time", "DATETIME DEFAULT NULL COMMENT '财务主管-审批时间' AFTER fin_approver");
        addColumnIfNotExists("biz_oa_request", "fin_approve_status", "VARCHAR(16) DEFAULT NULL COMMENT '财务主管-审批状态' AFTER fin_approve_time");

        // 3. 审批任务表
        jdbcTemplate.execute(
            "CREATE TABLE IF NOT EXISTS biz_oa_approval_task ("
            + "id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',"
            + "request_id BIGINT NOT NULL COMMENT '关联流程实例ID',"
            + "node_name VARCHAR(64) NOT NULL COMMENT '审批节点名称',"
            + "sort_order INT NOT NULL DEFAULT 0 COMMENT '节点顺序',"
            + "approval_rule VARCHAR(16) NOT NULL DEFAULT 'any' COMMENT 'any=或签 / all=会签',"
            + "approver VARCHAR(64) DEFAULT NULL COMMENT '审批人',"
            + "task_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/approved/rejected',"
            + "approve_time DATETIME DEFAULT NULL COMMENT '审批时间',"
            + "comment VARCHAR(500) DEFAULT NULL COMMENT '审批意见',"
            + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',"
            + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',"
            + "KEY idx_oa_task_request (request_id),"
            + "KEY idx_oa_task_approver (approver),"
            + "KEY idx_oa_task_status (task_status)"
            + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OA审批任务表'");

        // 4. 种子数据：流程类型
        jdbcTemplate.update(
            "INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, workflow_type, sort_order, status) VALUES "
            + "('oa_leave', '請假申請', 'hr', 'CalendarOutlined', '員工請假申請流程', 'oa_general', 1, 1), "
            + "('oa_reimburse', '報銷申請', 'finance', 'DollarOutlined', '費用報銷申請流程', 'oa_general', 2, 1), "
            + "('oa_purchase', '採購申請', 'finance', 'ShoppingCartOutlined', '辦公物資採購申請流程', 'oa_general', 3, 1), "
            + "('oa_seal', '用章申請', 'office', 'AuditOutlined', '公章使用申請流程', 'oa_general', 4, 1), "
            + "('oa_general', '通用審批', 'general', 'FormOutlined', '通用審批流程，適用於一般事項', 'oa_general', 5, 1)");

        // 5. 流程配置：OA通用审批流程
        jdbcTemplate.update(
            "INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description) "
            + "VALUES ('oa_general', 'OA通用審批', 1, 'OA中心通用審批流程，默認一級審批')");

        // 6. 编号规则：OA流程编号
        jdbcTemplate.update(
            "INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, remark) "
            + "VALUES ('oa_request', 'OA流程編號', 'OA中心', 'OA', 'YYYYMMDD', 4, 1, '{prefix} + YYYYMMDD + {n}位自增序號')");

        log.info("OA中心表及种子数据已就绪");
    }

    /**
     * 幂等补列：若表不存在该列则执行 ALTER TABLE ADD COLUMN
     */
    private void addColumnIfNotExists(String table, String column, String columnDef) {
        try {
            // 查询列是否存在
            var rs = jdbcTemplate.queryForList(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                table, column);
            if (rs.isEmpty()) {
                jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + columnDef);
                log.info("已为表 {} 添加列 {}", table, column);
            }
        } catch (Exception e) {
            log.warn("补列 {} 失败: {}", column, e.getMessage());
        }
    }

    /** 若密码非合法 BCrypt 值(如 SQL 占位符), 则重置为默认密码的加密值 */
    private void resetPasswordIfNeeded(String username, String rawPassword) {
        SysUser user = sysUserMapper.selectOne(
                new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername, username));
        if (user == null) {
            return;
        }
        String pwd = user.getPassword();
        boolean validBcrypt = pwd != null && pwd.startsWith("$2") && pwd.length() >= 60;
        if (!validBcrypt) {
            user.setPassword(passwordEncoder.encode(rawPassword));
            sysUserMapper.updateById(user);
            log.info("已初始化用户 [{}] 的默认密码", username);
        }
    }

    /**
     * 迁移旧表数据到统一 OA 表
     * 将 biz_fin_approval 数据复制到 biz_oa_request
     */
    private void migrateOaData() {
        try {
            // 检查 biz_fin_approval 表是否存在
            var tableCheck = jdbcTemplate.queryForList(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_approval'");
            if (tableCheck.isEmpty()) {
                log.info("biz_fin_approval 表不存在，跳过数据迁移");
                return;
            }

            // 检查是否已有数据（幂等）
            var count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_oa_request WHERE process_code IN ('recharge', 'transfer', 'deduct', 'merge')",
                Long.class);
            if (count != null && count > 0) {
                log.info("biz_oa_request 已有财务审批数据，跳过迁移");
                return;
            }

            // 迁移 biz_fin_approval 数据
            String insertSql = "INSERT INTO biz_oa_request (" +
                "flow_no, process_code, title, applicant, flow_status, " +
                "current_node_name, current_approver, reject_reason, " +
                "apply_time, complete_time, cancel_time, " +
                "group_id, group_name, brand, " +
                "biz_approver, biz_approve_time, biz_approve_status, " +
                "ops_approver, ops_approve_time, ops_approve_status, " +
                "fin_approver, fin_approve_time, fin_approve_status, " +
                "form_data, created_at, updated_at) " +
                "SELECT " +
                "flow_no, approval_type, " +
                "CONCAT(CASE approval_type " +
                "  WHEN 'recharge' THEN '充值申請' " +
                "  WHEN 'transfer' THEN '轉賬申請' " +
                "  WHEN 'deduct' THEN '扣款申請' " +
                "  WHEN 'merge' THEN '合併申請' " +
                "  ELSE approval_type END, ' ', applicant, ' ', DATE_FORMAT(apply_time, '%Y-%m-%d')), " +
                "applicant, flow_status, " +
                "CASE WHEN flow_status = 'pending' THEN " +
                "  CASE WHEN biz_approve_status = 'pending' THEN 'business' " +
                "       WHEN ops_approve_status = 'pending' THEN 'operation' " +
                "       ELSE 'finance' END " +
                "ELSE NULL END, " +
                "CASE WHEN flow_status = 'pending' THEN " +
                "  CASE WHEN biz_approve_status = 'pending' THEN biz_approver " +
                "       WHEN ops_approve_status = 'pending' THEN ops_approver " +
                "       ELSE fin_approver END " +
                "ELSE NULL END, " +
                "reject_reason, " +
                "apply_time, " +
                "CASE WHEN flow_status = 'approved' THEN COALESCE(fin_approve_time, ops_approve_time, biz_approve_time) ELSE NULL END, " +
                "CASE WHEN flow_status = 'cancelled' THEN NOW() ELSE NULL END, " +
                "group_code, group_name, brand, " +
                "biz_approver, biz_approve_time, biz_approve_status, " +
                "ops_approver, ops_approve_time, ops_approve_status, " +
                "fin_approver, fin_approve_time, fin_approve_status, " +
                "extra, created_at, updated_at " +
                "FROM biz_fin_approval WHERE deleted = 0";

            int rows = jdbcTemplate.update(insertSql);
            log.info("已从 biz_fin_approval 迁移 {} 条数据到 biz_oa_request", rows);

            // 迁移 ai_access_request 数据
            var aiTableCheck = jdbcTemplate.queryForList(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_access_request'");
            if (!aiTableCheck.isEmpty()) {
                var aiCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM biz_oa_request WHERE process_code = 'ai_access'",
                    Long.class);
                if (aiCount == null || aiCount == 0) {
                    String aiInsertSql = "INSERT INTO biz_oa_request (" +
                        "flow_no, process_code, title, applicant, flow_status, " +
                        "current_node_name, current_approver, reject_reason, " +
                        "apply_time, complete_time, cancel_time, " +
                        "group_id, group_name, brand, " +
                        "biz_approver, biz_approve_time, biz_approve_status, " +
                        "ops_approver, ops_approve_time, ops_approve_status, " +
                        "fin_approver, fin_approve_time, fin_approve_status, " +
                        "form_data, created_at, updated_at) " +
                        "SELECT " +
                        "CONCAT('AI', LPAD(CAST(id AS CHAR), 6, '0')), 'ai_access', " +
                        "CONCAT('AI申請 ', COALESCE(applicant_name, ''), ' ', DATE_FORMAT(created_at, '%Y-%m-%d')), " +
                        "COALESCE(applicant_name, ''), " +
                        "CASE WHEN status = 'approved' THEN 'approved' WHEN status = 'rejected' THEN 'rejected' ELSE 'pending' END, " +
                        "CASE WHEN status = 'pending' THEN 'business' ELSE NULL END, " +
                        "NULL, " +
                        "approve_remark, " +
                        "created_at, " +
                        "CASE WHEN status = 'approved' THEN approved_at ELSE NULL END, " +
                        "NULL, " +
                        "NULL, NULL, NULL, " +
                        "NULL, NULL, NULL, " +
                        "NULL, NULL, NULL, " +
                        "NULL, NULL, NULL, " +
                        "JSON_OBJECT('request_type', request_type, 'usage_description', usage_description, " +
                        "  'approved_models', approved_models, 'approved_quota_type', approved_quota_type, " +
                        "  'approved_quota_value', approved_quota_value, 'approved_quota_period', approved_quota_period), " +
                        "created_at, updated_at " +
                        "FROM ai_access_request WHERE deleted = 0";
                    int aiRows = jdbcTemplate.update(aiInsertSql);
                    log.info("已从 ai_access_request 迁移 {} 条数据到 biz_oa_request", aiRows);
                } else {
                    log.info("biz_oa_request 已有 AI 申请数据，跳过迁移");
                }
            }
        } catch (Exception e) {
            log.warn("OA数据迁移失败: {}", e.getMessage());
        }
    }

    /**
     * 迁移 AI 申请数据到统一 OA 表
     */
    private void migrateAiAccessData() {
        try {
            var aiTableCheck = jdbcTemplate.queryForList(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_access_request'");
            if (aiTableCheck.isEmpty()) {
                log.info("ai_access_request 表不存在，跳过数据迁移");
                return;
            }

            var aiCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_oa_request WHERE process_code = 'ai_access'",
                Long.class);
            if (aiCount != null && aiCount > 0) {
                log.info("biz_oa_request 已有 AI 申请数据，跳过迁移");
                return;
            }

            String aiInsertSql = "INSERT INTO biz_oa_request (" +
                "flow_no, process_code, title, applicant, flow_status, " +
                "current_node_name, current_approver, reject_reason, " +
                "apply_time, complete_time, cancel_time, " +
                "group_id, group_name, brand, " +
                "biz_approver, biz_approve_time, biz_approve_status, " +
                "ops_approver, ops_approve_time, ops_approve_status, " +
                "fin_approver, fin_approve_time, fin_approve_status, " +
                "form_data, created_at, updated_at) " +
                "SELECT " +
                "CONCAT('AI', LPAD(CAST(id AS CHAR), 6, '0')), 'ai_access', " +
                "CONCAT('AI申請 ', COALESCE(applicant_name, ''), ' ', DATE_FORMAT(created_at, '%Y-%m-%d')), " +
                "COALESCE(applicant_name, ''), " +
                "CASE WHEN status = 'approved' THEN 'approved' WHEN status = 'rejected' THEN 'rejected' ELSE 'pending' END, " +
                "CASE WHEN status = 'pending' THEN 'business' ELSE NULL END, " +
                "NULL, " +
                "approve_remark, " +
                "created_at, " +
                "CASE WHEN status = 'approved' THEN approved_at ELSE NULL END, " +
                "NULL, " +
                "NULL, NULL, NULL, " +
                "NULL, NULL, NULL, " +
                "NULL, NULL, NULL, " +
                "NULL, NULL, NULL, " +
                "JSON_OBJECT('request_type', request_type, 'usage_description', usage_description, " +
                "  'approved_models', approved_models, 'approved_quota_type', approved_quota_type, " +
                "  'approved_quota_value', approved_quota_value, 'approved_quota_period', approved_quota_period), " +
                "created_at, updated_at " +
                "FROM ai_access_request WHERE deleted = 0";
            int aiRows = jdbcTemplate.update(aiInsertSql);
            log.info("已从 ai_access_request 迁移 {} 条数据到 biz_oa_request", aiRows);
        } catch (Exception e) {
            log.warn("AI申请数据迁移失败: {}", e.getMessage());
        }
    }

    /**
     * 修复已迁移的 biz_oa_request 数据：从 biz_fin_approval 重新同步所有字段
     * 解决因列不存在导致的部分字段为空的问题
     */
    private void fixMigratedOaData() {
        try {
            var tableCheck = jdbcTemplate.queryForList(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_fin_approval'");
            if (tableCheck.isEmpty()) {
                log.info("biz_fin_approval 表不存在，跳过修复迁移");
                return;
            }

            String updateSql = "UPDATE biz_oa_request o " +
                "INNER JOIN biz_fin_approval f ON o.flow_no = f.flow_no " +
                "SET o.group_id = f.group_code, " +
                "    o.group_name = f.group_name, " +
                "    o.brand = f.brand, " +
                "    o.biz_approver = f.biz_approver, " +
                "    o.biz_approve_time = f.biz_approve_time, " +
                "    o.biz_approve_status = f.biz_approve_status, " +
                "    o.ops_approver = f.ops_approver, " +
                "    o.ops_approve_time = f.ops_approve_time, " +
                "    o.ops_approve_status = f.ops_approve_status, " +
                "    o.fin_approver = f.fin_approver, " +
                "    o.fin_approve_time = f.fin_approve_time, " +
                "    o.fin_approve_status = f.fin_approve_status, " +
                "    o.reject_reason = f.reject_reason, " +
                "    o.current_node_name = CASE WHEN f.flow_status = 'pending' THEN " +
                "        CASE WHEN f.biz_approve_status = 'pending' THEN '業務主管審批' " +
                "             WHEN f.ops_approve_status = 'pending' THEN '運營主管審批' " +
                "             ELSE '財務主管審批' END " +
                "        ELSE NULL END, " +
                "    o.current_approver = CASE WHEN f.flow_status = 'pending' THEN " +
                "        CASE WHEN f.biz_approve_status = 'pending' THEN f.biz_approver " +
                "             WHEN f.ops_approve_status = 'pending' THEN f.ops_approver " +
                "             ELSE f.fin_approver END " +
                "        ELSE NULL END " +
                "WHERE o.process_code IN ('recharge', 'transfer', 'deduct', 'merge')";

            int rows = jdbcTemplate.update(updateSql);
            log.info("已修复 biz_oa_request 中 {} 条财务审批记录的字段", rows);
        } catch (Exception e) {
            log.warn("修复迁移数据失败: {}", e.getMessage());
        }
    }

    /**
     * 修复 AI 申请记录的 current_node_name 和 current_approver
     * 从 biz_workflow_config 读取节点配置和路由规则，更新 biz_oa_request
     */
    private void fixAiAccessOaData() {
        try {
            // 先确保 biz_workflow_config 表有 nodes_config 和 routing_rules 列
            addColumnIfNotExists("biz_workflow_config", "nodes_config", "TEXT DEFAULT NULL COMMENT '审批节点配置JSON' AFTER description");
            addColumnIfNotExists("biz_workflow_config", "routing_rules", "TEXT DEFAULT NULL COMMENT '路由规则JSON' AFTER nodes_config");

            // 读取 AI 申请的流程配置
            var configList = jdbcTemplate.queryForList(
                "SELECT nodes_config, routing_rules FROM biz_workflow_config WHERE flow_type = 'ai_access'");
            if (configList.isEmpty()) {
                log.info("biz_workflow_config 中无 ai_access 配置，跳过修复");
                return;
            }
            var config = configList.get(0);
            String nodesConfigJson = (String) config.get("nodes_config");
            String routingRulesJson = (String) config.get("routing_rules");
            if (nodesConfigJson == null || routingRulesJson == null) {
                log.info("ai_access 流程配置缺少 nodes_config 或 routing_rules，跳过修复");
                return;
            }

            // 解析节点配置和路由规则
            List<Map<String, Object>> nodesConfig = JsonUtils.parseMapList(nodesConfigJson);
            List<Map<String, Object>> routingRules = JsonUtils.parseMapList(routingRulesJson);
            if (nodesConfig.isEmpty() || routingRules.isEmpty()) {
                log.info("ai_access 流程配置解析为空，跳过修复");
                return;
            }

            // 获取第一条路由规则（优先级最高）的激活节点
            Map<String, Object> firstRule = routingRules.get(0);
            @SuppressWarnings("unchecked")
            List<String> activatedNodeIds = (List<String>) firstRule.get("activatedNodeIds");
            if (activatedNodeIds == null || activatedNodeIds.isEmpty()) {
                log.info("ai_access 路由规则无激活节点，跳过修复");
                return;
            }

            // 找到第一个激活节点的名称和审批人
            String firstNodeId = activatedNodeIds.get(0);
            Map<String, Object> firstNode = nodesConfig.stream()
                .filter(n -> firstNodeId.equals(n.get("id")))
                .findFirst().orElse(null);
            if (firstNode == null) {
                log.info("ai_access 未找到节点配置 id={}, 跳过修复", firstNodeId);
                return;
            }

            String nodeName = (String) firstNode.get("name");
            // 解析审批人
            @SuppressWarnings("unchecked")
            Map<String, Object> approverConfig = (Map<String, Object>) firstNode.get("approverConfig");
            String approverName = "";
            if (approverConfig != null) {
                @SuppressWarnings("unchecked")
                Map<String, Object> defaultSetting = (Map<String, Object>) approverConfig.get("default");
                if (defaultSetting != null) {
                    @SuppressWarnings("unchecked")
                    List<String> approverIds = (List<String>) defaultSetting.get("approverIds");
                    if (approverIds != null && !approverIds.isEmpty()) {
                        // 查询审批人姓名
                        String placeholders = approverIds.stream().map(id -> "?").collect(java.util.stream.Collectors.joining(","));
                        var users = jdbcTemplate.queryForList(
                            "SELECT name FROM sys_user WHERE id IN (" + placeholders + ") AND deleted = 0",
                            approverIds.toArray());
                        approverName = users.stream()
                            .map(u -> (String) u.get("name"))
                            .filter(java.util.Objects::nonNull)
                            .collect(java.util.stream.Collectors.joining(","));
                    }
                }
            }

            // 更新 biz_oa_request 中 pending 状态的 AI 申请记录
            String updateSql = "UPDATE biz_oa_request SET current_node_name = ?, current_approver = ? " +
                "WHERE process_code = 'ai_access' AND flow_status = 'pending'";
            int rows = jdbcTemplate.update(updateSql, nodeName, approverName);
            log.info("已修复 biz_oa_request 中 {} 条 AI 申请记录的节点和审批人 (node={}, approver={})", rows, nodeName, approverName);
        } catch (Exception e) {
            log.warn("修复 AI 申请数据失败: {}", e.getMessage());
        }
    }

    /**
     * 恢復被 v23 清理邏輯誤刪的 asset-claim / asset-return 菜單
     * v24 中這兩個菜單已重新定義為獨立頁面（領用管理 / 歸還管理）
     */
    private void restoreEamClaimReturnMenus() {
        try {
            Long assetMgmtId = queryMenuIdByKey("asset-management");
            if (assetMgmtId == null) {
                log.info("物資管理父菜單不存在，跳過恢復 asset-claim/asset-return");
                return;
            }
            String[][] menusToRestore = {
                {"asset-claim",  "領用歸還", "UserAddOutlined",  "9"},
                {"asset-return", "歸還管理", "RollbackOutlined", "11"},
            };
            int restored = 0;
            for (String[] menu : menusToRestore) {
                String menuKey = menu[0];
                String name = menu[1];
                String icon = menu[2];
                int sort = Integer.parseInt(menu[3]);
                // 先檢查是否已存在（deleted=0）
                Long existing = queryMenuIdByKey(menuKey);
                if (existing != null) {
                    continue; // 已存在，跳過
                }
                // 檢查是否有軟刪除的記錄可以恢復
                List<Long> deletedIds = jdbcTemplate.queryForList(
                    "SELECT id FROM sys_menu WHERE menu_key = ? AND deleted = 1 LIMIT 1",
                    Long.class, menuKey);
                if (!deletedIds.isEmpty()) {
                    // 恢復軟刪除的記錄
                    jdbcTemplate.update(
                        "UPDATE sys_menu SET deleted = 0, parent_id = ?, name = ?, icon = ?, sort_order = ?, status = 1, updated_by = 'system' WHERE id = ?",
                        assetMgmtId, name, icon, sort, deletedIds.get(0));
                    restored++;
                    log.info("恢復菜單: {} (id={})", menuKey, deletedIds.get(0));
                } else {
                    // 全新插入
                    jdbcTemplate.update(
                        "INSERT INTO sys_menu (parent_id, menu_key, name, icon, type, sort_order, actions, status, deleted) "
                            + "VALUES (?, ?, ?, ?, 2, ?, '[\"view\"]', 1, 0)",
                        assetMgmtId, menuKey, name, icon, sort);
                    restored++;
                    log.info("新建菜單: {}", menuKey);
                }
            }
            log.info("已恢復/新建 {} 個 EAM 菜單", restored);
        } catch (Exception e) {
            log.warn("恢復 EAM 菜單失敗: {}", e.getMessage());
        }
    }

    /**
     * 移除「統計報表」菜單（已與「資產看板」合併）
     */
    private void removeAssetReportMenu() {
        try {
            Long menuId = queryMenuIdByKey("asset-report");
            if (menuId == null) {
                log.info("asset-report 菜單不存在，跳過移除");
                return;
            }
            jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id = ?", menuId);
            jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id = ?", menuId);
            jdbcTemplate.update("UPDATE sys_menu SET deleted = 1, updated_by = 'system' WHERE id = ?", menuId);
            log.info("已移除「統計報表」菜單 (id={})", menuId);
        } catch (Exception e) {
            log.warn("移除統計報表菜單失敗: {}", e.getMessage());
        }
    }

    /**
     * 「資產流轉」分組菜單改名為「資產管理」
     */
    private void renameAssetFlowOpsMenu() {
        try {
            Long menuId = queryMenuIdByKey("asset-flow-ops");
            if (menuId == null) {
                log.info("asset-flow-ops 菜單不存在，跳過改名");
                return;
            }
            jdbcTemplate.update("UPDATE sys_menu SET name = '資產管理', updated_by = 'system' WHERE id = ?", menuId);
            log.info("已將「資產流轉」改名為「資產管理」 (id={})", menuId);
        } catch (Exception e) {
            log.warn("改名資產流轉菜單失敗: {}", e.getMessage());
        }
    }

    /**
     * v26: 「領用管理」改名為「領用歸還」
     */
    private void renameAssetClaimMenu() {
        try {
            Long menuId = queryMenuIdByKey("asset-claim");
            if (menuId == null) {
                log.info("asset-claim 菜單不存在，跳過改名");
                return;
            }
            jdbcTemplate.update("UPDATE sys_menu SET name = '領用歸還', updated_by = 'system' WHERE id = ?", menuId);
            log.info("已將「領用管理」改名為「領用歸還」 (id={})", menuId);
        } catch (Exception e) {
            log.warn("改名領用管理菜單失敗: {}", e.getMessage());
        }
    }

    /**
     * 清理 merchant-order-manage 占位菜单（每次启动执行）。
     * 前端 keyToPath 有定义但种子数据遗漏，resolveMenuId 会自动创建 parent_id=NULL 的占位记录，
     * 导致菜单树出现孤儿节点。此方法确保占位记录被彻底清除。
     */
    private void cleanupMerchantOrderManagePlaceholder() {
        try {
            Long menuId = queryMenuIdByKey("merchant-order-manage");
            if (menuId == null) {
                return;
            }
            jdbcTemplate.update("DELETE FROM sys_role_menu WHERE menu_id = ?", menuId);
            jdbcTemplate.update("DELETE FROM sys_department_menu WHERE menu_id = ?", menuId);
            jdbcTemplate.update("DELETE FROM sys_menu WHERE id = ?", menuId);
            log.info("已清理 merchant-order-manage 占位菜单 (id={})", menuId);
        } catch (Exception e) {
            log.warn("清理 merchant-order-manage 占位菜单失败: {}", e.getMessage());
        }
    }

}
