package com.mftb.admin.config;

import com.mftb.admin.util.BizSeqService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 编号生成规则初始化器: 启动时自动创建 sys_biz_seq_rule 规则表并写入种子规则
 * <p>
 * 与 {@link BizDataInitializer} 同模式: 幂等可重复执行, 免手动跑 SQL 脚本
 * (对应脚本 backend/sql/33_biz_seq_rule.sql)
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BizSeqRuleInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final SchemaVersionTracker versionTracker;
    private final BizSeqService bizSeqService;

    /** 初始化版本: 新增规则种子/补列步骤时递增 minor 版本号 (格式: v{major}.{minor}) */
    private static final String V_INIT = "seq:init-v1";

    /** 增量版本: AI 权控/额度配置ID规则种子 + 业务表补列 + 存量回填 */
    private static final String V_INIT_AI_CONFIG_CODE = "seq:init-v2";

    /** 增量版本: AI 对话编号规则种子 + 补列 + 存量回填 */
    private static final String V_INIT_AI_CONVERSATION = "seq:init-v3";

    /** 增量版本: EAM 采购申请流程编号规则种子（CG+YYYYMMDD+4位） */
    private static final String V_INIT_EAM_PURCHASE = "seq:init-v4";

    /** 增量版本: 流程配置ID编号规则种子（LC+5位自增） + biz_workflow_config 补列 */
    private static final String V_INIT_WORKFLOW_CONFIG = "seq:init-v5";

    /** 增量版本: AI 使用申请流程编号规则种子（AI+YYYYMMDD+4位） */
    private static final String V_INIT_AI_ACCESS = "seq:init-v6";

    /** 增量版本: 采购订单编号规则种子（DDCG+YYYYMMDD+4位） */
    private static final String V_INIT_EAM_PO_RULE = "seq:init-v7";

    /** 增量版本: 验收入库批次编号 (IB) + 资产编号 (FA) 规则种子 */
    private static final String V_INIT_EAM_IB_ASSET_RULE = "seq:init-v8";

    /** 增量版本: 供应商编码规则种子（CGSJ + 6位全局自增，无日期维度） */
    private static final String V_INIT_EAM_SUPPLIER_RULE = "seq:init-v9";

    /** 增量版本: 领用编号 (LY) + 归还编号 (GH) 规则种子 */
    private static final String V_INIT_EAM_CLAIM_RETURN_RULE = "seq:init-v10";

    /** 增量版本: 借用编号 (JY) + 赔付编号 (PF) 规则种子 */
    private static final String V_INIT_EAM_BORROW_COMP_RULE = "seq:init-v11";

    /** 增量版本: 交接编号 (JJ) 规则种子 */
    private static final String V_INIT_EAM_HANDOVER_RULE = "seq:init-v12";

    /** 增量版本: 调拨编号 (DB) 规则种子 */
    private static final String V_INIT_EAM_TRANSFER_RULE = "seq:init-v13";

    /** 增量版本: 修正赔付编号规则触发菜单归属（歸還管理 → 賠付管理），重跑借用+赔付种子幂等修正 */
    private static final String V_INIT_EAM_COMP_MENU_FIX = "seq:init-v14";

    /** 增量版本: 盘点任务编号 (PD) 规则种子 */
    private static final String V_INIT_EAM_INVENTORY_RULE = "seq:init-v15";

    /**
     * 增量版本: 物资管理归属菜单文案统一。
     * 一级菜单已统一为「物資管理」, 编号规则的 biz_menu 由「物資管理(EAM)-XX」改为「物資管理-XX」,
     * 并对齐本轮改名的子菜单（採購訂單 → 採購執行、賠付管理 → 損壞賠付）。
     */
    private static final String V_INIT_EAM_MENU_LABEL_UNIFY = "seq:init-v16";

    /** 增量版本: 遗失编号 (YS) + 报废编号 (BF) 规则种子 */
    private static final String V_INIT_EAM_LOSS_SCRAP_RULE = "seq:init-v17";

    /**
     * 增量版本: 投流廣告算法ID前綴 SFLL → SFTL（規則 + 序號沿用 + 存量編號回填），
     * 并把 5 个广告定价规则统一登记到「銷售定價」菜单（前端「編號生成規則」按 biz_menu 归类）。
     */
    private static final String V_INIT_TRAFFIC_ALGO_PREFIX = "seq:init-v18";

    /** 投流廣告算法ID规则 key（BizSeqService.algoRuleKey(15)） */
    private static final String RULE_ALGO_TRAFFIC = "algo_traffic";

    /** 投流廣告算法ID旧前缀（已废弃，仅作存量迁移依据） */
    private static final String TRAFFIC_ALGO_OLD_PREFIX = "SFLL";

    /** 投流廣告算法ID现行前缀（投流拼音首字母，与其它 SFX* 系列算法前缀同构） */
    private static final String TRAFFIC_ALGO_PREFIX = "SFTL";

    /** 銷售定價规则的「所属菜单」文案，必须与前端 ruleConfig.tsx 的 menu 完全一致 */
    private static final String PRICING_BIZ_MENU = "銷售定價";

    /** 销售定价 5 个广告定价规则：rule_key / rule_name / prefix（序号统一 3 位、日期 YYYYMMDD） */
    private static final String[][] PRICING_RULES = {
            {"config_pricing_star", "無敵星星定價", "DJWD"},
            {"config_pricing_hot", "人氣商家定價", "DJRQ"},
            {"config_pricing_revive", "盤活復蘇定價", "DJPH"},
            {"config_pricing_signboard", "金字招牌定價", "DJZP"},
            {"config_pricing_traffic", "投流廣告定價", "DJTL"},
    };

    /**
     * 增量版本: 贈送ID口径收口——补齐金字招牌/投流廣告的赠送ID规则，并把存量不符合现行格式的
     * 赠送ID按创建日期重新取号（消费流水快照同步），同时清理旧生成器遗留的孤儿计数行。
     */
    private static final String V_INIT_GIFT_AD_TYPE_RULES = "seq:init-v19";

    /** 推廣贈送规则的「所属菜单」文案，必须与前端菜单名完全一致 */
    private static final String GIFT_BIZ_MENU = "推廣贈送";

    /** 赠送ID 5 个广告类型规则：rule_key / rule_name / prefix（序号统一 4 位、日期 YYYYMMDD） */
    private static final String[][] GIFT_RULES = {
            {"gift_new_store", "新店廣告贈送ID", "XDZS"},
            {"gift_popular", "人氣商家贈送ID", "RQZS"},
            {"gift_revive", "盤活復蘇贈送ID", "PHZS"},
            {"gift_signboard", "金字招牌贈送ID", "JZZS"},
            {"gift_traffic", "投流廣告贈送ID", "TLZS"},
    };

    /** 现行赠送ID格式：5 个前缀 + YYYYMMDD + 4 位序号 */
    private static final String GIFT_ID_PATTERN = "^(XDZS|PHZS|RQZS|JZZS|TLZS)[0-9]{12}$";

    /** 旧赠送ID生成器的前缀（已无对应规则，其序号计数属孤儿行，需清理） */
    private static final String LEGACY_GIFT_SEQ_PREFIX = "GZ";

    @Override
    public void run(String... args) {
        // 一次性初始化按版本执行, 重启时已执行的直接跳过 (启动提速)
        versionTracker.applyOnce(V_INIT, () -> {
            createRuleTableIfAbsent();
            seedRules();
            ensureBizCodeColumns();
            backfillPositionCodes();
        });
        versionTracker.applyOnce(V_INIT_AI_CONFIG_CODE, () -> {
            seedAiConfigCodeRules();
            ensureAiConfigCodeColumns();
            backfillAiConfigCodes();
        });
        versionTracker.applyOnce(V_INIT_AI_CONVERSATION, () -> {
            seedAiConversationRule();
            ensureAiConversationColumn();
            backfillAiConversationIds();
        });
        versionTracker.applyOnce(V_INIT_EAM_PURCHASE, () -> {
            seedEamPurchaseRequestRule();
        });
        versionTracker.applyOnce(V_INIT_WORKFLOW_CONFIG, () -> {
            seedWorkflowConfigRule();
            ensureWorkflowConfigIdColumn();
            backfillWorkflowConfigIds();
        });
        versionTracker.applyOnce(V_INIT_AI_ACCESS, () -> {
            seedAiAccessRequestRule();
        });
        versionTracker.applyOnce(V_INIT_EAM_PO_RULE, () -> {
            seedEamPurchaseOrderRule();
        });
        versionTracker.applyOnce(V_INIT_EAM_IB_ASSET_RULE, () -> {
            seedEamInboundBatchAndAssetRules();
        });
        versionTracker.applyOnce(V_INIT_EAM_SUPPLIER_RULE, () -> {
            seedEamSupplierCodeRule();
        });
        versionTracker.applyOnce(V_INIT_EAM_CLAIM_RETURN_RULE, () -> {
            seedEamClaimReturnRules();
        });
        versionTracker.applyOnce(V_INIT_EAM_BORROW_COMP_RULE, () -> {
            seedEamBorrowCompRules();
        });
        versionTracker.applyOnce(V_INIT_EAM_HANDOVER_RULE, () -> {
            seedEamHandoverRule();
        });
versionTracker.applyOnce(V_INIT_EAM_TRANSFER_RULE, () -> {
            seedEamTransferRule();
        });
        versionTracker.applyOnce(V_INIT_EAM_COMP_MENU_FIX, () -> {
            seedEamBorrowCompRules();
        });
        versionTracker.applyOnce(V_INIT_EAM_INVENTORY_RULE, () -> {
            seedEamInventoryRule();
        });
        versionTracker.applyOnce(V_INIT_EAM_MENU_LABEL_UNIFY, this::normalizeEamRuleBizMenu);
        versionTracker.applyOnce(V_INIT_EAM_LOSS_SCRAP_RULE, this::seedEamLossScrapRules);
        versionTracker.applyOnce(V_INIT_TRAFFIC_ALGO_PREFIX,
                this::migrateTrafficAlgoPrefixAndPricingMenu, this::verifyTrafficAlgoPrefixAndPricingMenu);
        versionTracker.applyOnce(V_INIT_GIFT_AD_TYPE_RULES,
                this::seedGiftRulesAndNormalizeGiftIds, this::verifyGiftRulesAndGiftIds);
    }

    /**
     * 存量修正：把编号规则的「所属菜单」文案统一为「物資管理-<菜单名>」。
     * <p>
     * 直接基于 DB 做前缀替换（而非重跑种子）：部分规则（如資產分類編碼/倉庫編碼）
     * 由人工写入 sys_biz_seq_rule、无对应种子方法, 只有 REPLACE 能一并修正。
     * 两步替换幂等：先替换带分隔符的旧前缀, 再兜底处理无分隔符的裸前缀。
     */
    private void normalizeEamRuleBizMenu() {
        int withSuffix = jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET biz_menu = REPLACE(biz_menu, '物資管理(EAM)-', '物資管理-') "
                        + "WHERE biz_menu LIKE '物資管理(EAM)-%'");
        int bare = jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET biz_menu = '物資管理' WHERE biz_menu = '物資管理(EAM)'");
        int renamed = jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET biz_menu = REPLACE(biz_menu, '物資管理-採購訂單', '物資管理-採購執行') "
                        + "WHERE biz_menu LIKE '物資管理-採購訂單%'");
        int compensation = jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET biz_menu = REPLACE(biz_menu, '物資管理-賠付管理', '物資管理-損壞賠付') "
                        + "WHERE biz_menu LIKE '物資管理-賠付管理%'");
        log.info("编号规则归属菜单文案统一: 前缀 {} 条 / 裸前缀 {} 条 / 採購執行 {} 条 / 損壞賠付 {} 条",
                withSuffix, bare, renamed, compensation);
        bizSeqService.refreshRules();
    }

    /** 编号生成规则配置表 */
    private void createRuleTableIfAbsent() {
        if (tableExists("sys_biz_seq_rule")) {
            return;
        }
        jdbcTemplate.execute(
                "CREATE TABLE sys_biz_seq_rule ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "rule_key VARCHAR(64) NOT NULL COMMENT '规则唯一标识（与前端 key 一致）', "
                        + "rule_name VARCHAR(64) NOT NULL COMMENT '业务类型名称', "
                        + "biz_menu VARCHAR(64) NULL COMMENT '所属菜单', "
                        + "prefix VARCHAR(16) NOT NULL COMMENT '编号前缀', "
                        + "date_format VARCHAR(16) NOT NULL DEFAULT '' COMMENT '日期格式: YYYYMMDD / YYMM / 空=无日期维度', "
                        + "seq_length INT NOT NULL DEFAULT 4 COMMENT '自增序号位数', "
                        + "seq_start INT NOT NULL DEFAULT 0 COMMENT '序号起始: 0=从0000起 1=从0001起', "
                        + "remark VARCHAR(255) NULL COMMENT '备注', "
                        + "status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 1=启用 0=停用', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_seq_rule_key (rule_key), "
                        + "UNIQUE KEY uk_seq_rule_prefix (prefix)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='编号生成规则配置表'");
        log.info("已自动创建编号生成规则配置表 sys_biz_seq_rule");
    }

    /** 种子规则: 与前端「规则配置 > 编号生成规则」界面一致 (按 rule_key 幂等) */
    private void seedRules() {
        String[][] rules = {
                /* rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, remark */
                {"merchant_group", "集團ID", "商戶集團管理", "JT", "", "6", "1", "{prefix} + {n}位自增序號（取表內最大序號+1）"},
                {"store", "門店ID", "商戶集團管理", "MD", "", "6", "1", "{prefix} + {n}位固定序號（無日期維度，全局自增）"},
                {"algo_star", "無敵星星算法ID", "算法庫", "SFWD", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_new_store", "新店廣告算法ID", "算法庫", "SFXD", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_revive", "盤活復蘇算法ID", "算法庫", "SFPH", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_traffic", "投流廣告算法ID", "算法庫", TRAFFIC_ALGO_PREFIX, "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_popular", "人氣商家算法ID", "算法庫", "SFRQ", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_exclusive", "獨家商家算法ID", "算法庫", "SFDJ", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_guess", "猜你喜歡算法ID", "算法庫", "SFXH", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_organic", "自然流量算法ID", "算法庫", "SFZR", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_brand", "品牌商家算法ID", "算法庫", "SFPP", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_gold", "點金廣告算法ID", "算法庫", "SFJD", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_signboard", "金字招牌算法ID", "算法庫", "SFJZ", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"algo_promo", "商品促銷算法ID", "算法庫", "SFSP", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_waterfall", "瀑布流策略", "瀑布流配置", "PB", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_star", "無敵星星訂單", "廣告銷售", "DDWD", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_new_store", "新店廣告訂單", "廣告銷售", "DDXD", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_revive", "盤活復蘇訂單", "廣告銷售", "DDPH", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_traffic", "流量廣告訂單", "廣告銷售", "DDLL", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ad_order_popular", "人氣商家訂單", "廣告銷售", "DDRQ", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_pricing_star", "無敵星星定價", PRICING_BIZ_MENU, "DJWD", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_pricing_hot", "人氣商家定價", PRICING_BIZ_MENU, "DJRQ", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_pricing_revive", "盤活復蘇定價", PRICING_BIZ_MENU, "DJPH", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_pricing_signboard", "金字招牌定價", PRICING_BIZ_MENU, "DJZP", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"config_pricing_traffic", "投流廣告定價", PRICING_BIZ_MENU, "DJTL", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_new_store", "新店廣告贈送ID", "推廣贈送", "XDZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_popular", "人氣商家贈送ID", "推廣贈送", "RQZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_revive", "盤活復蘇贈送ID", "推廣贈送", "PHZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_signboard", "金字招牌贈送ID", "推廣贈送", "JZZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_traffic", "投流廣告贈送ID", "推廣贈送", "TLZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"batch_recharge", "充值批次", "批次查詢", "CZPC", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"batch_transfer", "轉賬批次", "批次查詢", "ZZPC", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"batch_merge", "合併批次", "批次查詢", "HBPC", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"detail", "交易明細編號", "明細查詢", "MX", "YYYYMMDD", "6", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"debt", "欠款單編號", "欠款對賬", "QK", "YYYYMMDD", "5", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"recharge", "充值流程編號", "審批中心", "CZ", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"deduct", "扣款流程編號", "審批中心", "KK", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"transfer", "轉賬流程編號", "審批中心", "ZZ", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"merge", "合併流程編號", "審批中心", "HB", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"gift_approval", "贈送流程編號", "審批中心", "ZS", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"employee_no", "工號", "員工管理", "MF", "", "5", "1", "{prefix} + {n}位自增序號（全局自增）"},
                {"dept_code", "部門編碼", "組織管理", "BM", "", "5", "1", "{prefix} + {n}位自增序號（全局自增）"},
                {"position_id", "職位ID", "職位管理", "ZW", "", "5", "1", "{prefix} + {n}位自增序號（全局自增）"},
                {"eam_purchase_order", "採購訂單編號", "物資管理-採購執行", "DDCG", "YYYYMMDD", "4", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
        };
        int inserted = 0;
        for (String[] r : rules) {
            inserted += jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_biz_seq_rule "
                            + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, remark) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    r[0], r[1], r[2], r[3], r[4], Integer.parseInt(r[5]), Integer.parseInt(r[6]), r[7]);
        }
        if (inserted > 0) {
            log.info("已写入 {} 条编号生成规则种子数据", inserted);
        }
    }

    /** 业务表补充编号字段（存量库无需手动跑 ALTER） */
    private void ensureBizCodeColumns() {
        ensureColumn("biz_ad_waterfall", "strategy_code",
                "VARCHAR(32) NULL COMMENT '策略编号（按编号生成规则 config_waterfall 生成）' AFTER id");
        ensureColumn("biz_ad_pricing_star", "pricing_no",
                "VARCHAR(32) NULL COMMENT '定价编号（按编号生成规则 config_pricing_star 生成）' AFTER id");
        ensureColumn("biz_ad_pricing_hot", "pricing_no",
                "VARCHAR(32) NULL COMMENT '定价编号（按编号生成规则 config_pricing_hot 生成）' AFTER id");
        ensureColumn("biz_ad_pricing_revive", "pricing_no",
                "VARCHAR(32) NULL COMMENT '定价编号（按编号生成规则 config_pricing_revive 生成）' AFTER id");
        ensureColumn("sys_position", "code",
                "VARCHAR(32) NULL COMMENT '职位ID（按编号生成规则 position_id 生成）' AFTER id");
    }

    /** 存量职位回填职位ID（规则 position_id，取表内最大序号+1，仅处理空值，幂等） */
    private void backfillPositionCodes() {
        if (!tableExists("sys_position") || !columnExists("sys_position", "code")) {
            return;
        }
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM sys_position WHERE code IS NULL OR code = '' ORDER BY id", Long.class);
        if (ids.isEmpty()) {
            return;
        }
        Map<String, Object> rule = jdbcTemplate.queryForMap(
                "SELECT prefix, seq_length FROM sys_biz_seq_rule WHERE rule_key = 'position_id'");
        String prefix = (String) rule.get("prefix");
        int seqLength = ((Number) rule.get("seq_length")).intValue();
        Integer maxSeq = jdbcTemplate.queryForObject(
                "SELECT IFNULL(MAX(CAST(SUBSTRING(code, " + (prefix.length() + 1) + ") AS UNSIGNED)), 0) "
                        + "FROM sys_position WHERE code REGEXP ?",
                Integer.class, "^" + prefix + "[0-9]+$");
        int seq = maxSeq == null ? 0 : maxSeq;
        for (Long id : ids) {
            jdbcTemplate.update("UPDATE sys_position SET code = ? WHERE id = ?",
                    String.format("%s%0" + seqLength + "d", prefix, ++seq), id);
        }
        log.info("已为 {} 个存量职位回填职位ID（{} 前缀）", ids.size(), prefix);
    }

    /** AI 权控/额度配置ID规则种子（模型授权管理 + 配额管理，与前端「编号生成规则」界面一致） */
    private void seedAiConfigCodeRules() {
        String[][] rules = {
                /* rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, remark */
                {"ai_dept_model_auth", "部門模型權控", "模型授權管理", "BMMX", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ai_emp_pos_model_auth", "員工模型權控-按職位", "模型授權管理", "ZWMX", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ai_emp_role_model_auth", "員工模型權控-按角色", "模型授權管理", "JSMX", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ai_dept_quota", "部門額度", "配額管理", "BMED", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
                {"ai_emp_pos_quota", "員工額度-按職位", "配額管理", "ZWED", "YYYYMM", "3", "0", "{prefix} + YYYYMM + {n}位自增序號"},
                {"ai_emp_role_quota", "員工額度-按角色", "配額管理", "JSED", "YYYYMMDD", "3", "0", "{prefix} + YYYYMMDD + {n}位自增序號"},
        };
        int inserted = 0;
        for (String[] r : rules) {
            inserted += jdbcTemplate.update(
                    "INSERT IGNORE INTO sys_biz_seq_rule "
                            + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, remark) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    r[0], r[1], r[2], r[3], r[4], Integer.parseInt(r[5]), Integer.parseInt(r[6]), r[7]);
        }
        if (inserted > 0) {
            log.info("已写入 {} 条 AI 权控/额度配置ID编号规则种子数据", inserted);
            bizSeqService.refreshRules();
        }
    }

    /** AI 权控/额度业务表补充配置ID字段（存量库无需手动跑 ALTER；新库建表脚本已含该列） */
    private void ensureAiConfigCodeColumns() {
        ensureColumn("ai_dept_auth_group", "config_code",
                "VARCHAR(32) NULL COMMENT '配置ID（按编号生成规则 ai_dept_model_auth 生成）' AFTER id");
        ensureColumn("ai_emp_pos_auth_strategy", "config_code",
                "VARCHAR(32) NULL COMMENT '配置ID（按编号生成规则 ai_emp_pos_model_auth 生成）' AFTER id");
        ensureColumn("ai_emp_role_auth", "config_code",
                "VARCHAR(32) NULL COMMENT '配置ID（按编号生成规则 ai_emp_role_model_auth 生成）' AFTER id");
        ensureColumn("ai_dept_quota_policy", "config_code",
                "VARCHAR(32) NULL COMMENT '配置ID（按编号生成规则 ai_dept_quota 生成）' AFTER id");
        ensureColumn("ai_emp_quota_policy", "config_code",
                "VARCHAR(32) NULL COMMENT '配置ID（按编号生成规则 ai_emp_pos_quota 生成）' AFTER id");
        ensureColumn("ai_role_quota_policy", "config_code",
                "VARCHAR(32) NULL COMMENT '配置ID（按编号生成规则 ai_emp_role_quota 生成）' AFTER id");
    }

    /** 存量数据回填配置ID（按创建日期补号，同日数据顺序自增，仅处理空值，幂等） */
    private void backfillAiConfigCodes() {
        String[][] tables = {
                /* table, rule_key */
                {"ai_dept_auth_group", BizSeqService.RULE_AI_DEPT_MODEL_AUTH},
                {"ai_emp_pos_auth_strategy", BizSeqService.RULE_AI_EMP_POS_MODEL_AUTH},
                {"ai_emp_role_auth", BizSeqService.RULE_AI_EMP_ROLE_MODEL_AUTH},
                {"ai_dept_quota_policy", BizSeqService.RULE_AI_DEPT_QUOTA},
                {"ai_emp_quota_policy", BizSeqService.RULE_AI_EMP_POS_QUOTA},
                {"ai_role_quota_policy", BizSeqService.RULE_AI_EMP_ROLE_QUOTA},
        };
        for (String[] t : tables) {
            if (!tableExists(t[0]) || !columnExists(t[0], "config_code")) {
                continue;
            }
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT id, created_at FROM " + t[0] + " WHERE config_code IS NULL OR config_code = '' ORDER BY id");
            for (Map<String, Object> row : rows) {
                Long id = ((Number) row.get("id")).longValue();
                String code = bizSeqService.next(t[1], toLocalDate(row.get("created_at")));
                jdbcTemplate.update("UPDATE " + t[0] + " SET config_code = ? WHERE id = ?", code, id);
            }
            if (!rows.isEmpty()) {
                log.info("已为表 {} 的 {} 条存量数据回填配置ID", t[0], rows.size());
            }
        }
    }

    /** DATETIME 列值 → 日期（兼容驱动返回 LocalDateTime / Timestamp 两种类型） */
    private LocalDate toLocalDate(Object value) {
        if (value instanceof LocalDateTime dateTime) {
            return dateTime.toLocalDate();
        }
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toLocalDateTime().toLocalDate();
        }
        if (value instanceof LocalDate date) {
            return date;
        }
        return LocalDate.now();
    }

    /** AI 对话编号规则种子（DH + YYYYMMDD + 7位自增序号） */
    private void seedAiConversationRule() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                "ai_conversation", "對話編號", "AI智能中心", "DH", "YYYYMMDD", 5, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入 AI 对话编号规则种子数据");
            bizSeqService.refreshRules();
        }
    }

    /** AI 对话表补充 conversation_id 字段 */
    private void ensureAiConversationColumn() {
        ensureColumn("ai_conversation", "conversation_id",
                "VARCHAR(32) NULL COMMENT '对话编号（DH+YYYYMMDD+7位自增序号）' AFTER id");
    }

    /** 存量对话数据回填对话编号（按创建日期补号，幂等） */
    private void backfillAiConversationIds() {
        if (!tableExists("ai_conversation") || !columnExists("ai_conversation", "conversation_id")) {
            return;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, created_at FROM ai_conversation WHERE conversation_id IS NULL OR conversation_id = '' ORDER BY id");
        for (Map<String, Object> row : rows) {
            Long id = ((Number) row.get("id")).longValue();
            String code = bizSeqService.next(BizSeqService.RULE_AI_CONVERSATION, toLocalDate(row.get("created_at")));
            jdbcTemplate.update("UPDATE ai_conversation SET conversation_id = ? WHERE id = ?", code, id);
        }
        if (!rows.isEmpty()) {
            log.info("已为 {} 条存量对话回填对话编号", rows.size());
        }
    }

    /** EAM 采购申请流程编号规则种子（CG + YYYYMMDD + 4位自增序号，归属审批中心） */
    private void seedEamPurchaseRequestRule() {
        // 先修正可能由旧 SQL 迁移写入的格式不一致记录（date_format 大小写、biz_menu 缺失）
        jdbcTemplate.update(
                "UPDATE sys_biz_seq_rule SET date_format = 'YYYYMMDD', biz_menu = '審批中心', "
                        + "seq_start = 0, remark = '{prefix} + YYYYMMDD + {n}位自增序號' "
                        + "WHERE rule_key = ?",
                BizSeqService.RULE_EAM_PURCHASE_REQUEST);
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                BizSeqService.RULE_EAM_PURCHASE_REQUEST, "採購申請流程編號", "審批中心",
                "CG", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入 EAM 采购申请流程编号规则种子数据");
            bizSeqService.refreshRules();
        }
    }

    /** 流程配置ID编号规则种子（LC + 5位自增序号，无日期维度，归属审批中心） */
    private void seedWorkflowConfigRule() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                BizSeqService.RULE_WORKFLOW_CONFIG, "流程配置ID", "審批中心",
                "LC", "", 5, 1, 1,
                "{prefix} + {n}位自增序號（全局自增）");
        if (inserted > 0) {
            log.info("已写入流程配置ID编号规则种子数据");
            bizSeqService.refreshRules();
        }
    }

    /** biz_workflow_config 补充 config_id 字段 */
    private void ensureWorkflowConfigIdColumn() {
        ensureColumn("biz_workflow_config", "config_id",
                "VARCHAR(32) NULL COMMENT '配置ID（LC+5位自增序号）' AFTER id");
    }

    /** 存量流程配置回填 config_id（幂等） */
    private void backfillWorkflowConfigIds() {
        if (!tableExists("biz_workflow_config") || !columnExists("biz_workflow_config", "config_id")) {
            return;
        }
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM biz_workflow_config WHERE config_id IS NULL OR config_id = '' ORDER BY id", Long.class);
        for (Long id : ids) {
            String configId = bizSeqService.next(BizSeqService.RULE_WORKFLOW_CONFIG);
            jdbcTemplate.update("UPDATE biz_workflow_config SET config_id = ? WHERE id = ?", configId, id);
        }
        if (!ids.isEmpty()) {
            log.info("已为 {} 条存量流程配置回填配置ID", ids.size());
        }
    }

    /** AI 使用申请流程编号规则种子（AI + YYYYMMDD + 4位自增序号，归属审批中心） */
    private void seedAiAccessRequestRule() {
        int inserted = jdbcTemplate.update(
                "INSERT IGNORE INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                BizSeqService.RULE_AI_ACCESS_REQUEST, "AI申請流程編號", "審批中心",
                "AI", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入 AI 使用申请流程编号规则种子数据");
            bizSeqService.refreshRules();
        }
    }

    /** 采购订单编号规则种子（DDCG + YYYYMMDD + 4位自增序号，归属物资管理）
     *  使用 ON DUPLICATE KEY UPDATE 确保 rule_key / prefix 冲突时也能修正字段 */
    private void seedEamPurchaseOrderRule() {
        int affected = jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_PURCHASE_ORDER, "採購訂單編號", "物資管理-採購執行",
                "DDCG", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (affected > 0) {
            log.info("已写入/修正采购订单编号规则种子数据");
            bizSeqService.refreshRules();
        }
    }

    /** 验收入库批次编号 (IB) + 资产编号 (FA) 规则种子 */
    private void seedEamInboundBatchAndAssetRules() {
        int inserted = 0;
        // 验收入库批次编号: IB + YYYYMMDD + 4位自增序号
        inserted += jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_INBOUND_BATCH, "驗收入庫批次編號", "物資管理-驗收入庫",
                "IB", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        // 资产编号: {品牌编碼}-{倉庫编碼}-{分類碼}-{4位分類內自增序號} (示例: TB-ZH-0101-0001)
        // 注意: 實際編號由 EamAssetService.generateAssetNo() 生成，不走 BizSeqService 全局序列
        // 此規則僅供前端規則配置頁展示格式說明
        inserted += jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_ASSET, "資產編號", "物資管理-資產台賬",
                "TB", "", 4, 0, 1,
                "{品牌编碼}-{倉庫编碼}-{分類碼}-{n}位分類內自增序號");
        if (inserted > 0) {
            log.info("已写入/修正验收入库批次编号 + 资产编号规则种子数据");
            bizSeqService.refreshRules();
        }
    }

    /** 供应商编码规则种子（CGSJ + 6位全局自增，归属物资管理-供应商管理） */
    private void seedEamSupplierCodeRule() {
        int affected = jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_SUPPLIER_CODE, "供應商編碼", "物資管理-供應商管理",
                "CGSJ", "", 6, 1, 1,
                "{prefix} + {n}位數字自增（全局自增，如 CGSJ000001、CGSJ000002）");
        if (affected > 0) {
            log.info("已写入/修正供应商编码规则种子数据 (CGSJ + 6位全局自增)");
            bizSeqService.refreshRules();
        }
    }

    /** 领用编号 (LY+YYYYMMDD+4位) + 归还编号 (GH+YYYYMMDD+4位) + 借用编号 (JY+YYYYMMDD+4位) + 赔付编号 (PF+YYYYMMDD+4位) 规则种子 */
    private void seedEamClaimReturnRules() {
        int inserted = 0;
        inserted += jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_CLAIM, "領用編號", "物資管理-領用資產",
                "LY", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        inserted += jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_RETURN, "歸還編號", "物資管理-資產歸還",
                "GH", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入/修正领用 + 归还编号规则种子数据");
            bizSeqService.refreshRules();
        }
    }

    /** 借用编号 (JY+YYYYMMDD+4位) + 赔付编号 (PF+YYYYMMDD+4位) 规则种子 (v11) */
    private void seedEamBorrowCompRules() {
        int inserted = 0;
        inserted += jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_BORROW, "借用編號", "物資管理-借用資產",
                "JY", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        inserted += jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_COMPENSATION, "賠付編號", "物資管理-損壞賠付",
                "PF", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入/修正借用 + 赔付编号规则种子数据");
            bizSeqService.refreshRules();
        }
    }

    /** 交接编号 (JJ+YYYYMMDD+4位) 规则种子 (v12) */
    private void seedEamHandoverRule() {
        int inserted = jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_HANDOVER, "交接編號", "物資管理-資產交接",
                "JJ", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入/修正交接编号规则种子数据 (JJ + YYYYMMDD + 4位)");
            bizSeqService.refreshRules();
        }
    }

    /** 调拨编号 (DB+YYYYMMDD+4位) 规则种子 (v13) */
    private void seedEamTransferRule() {
        int inserted = jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_TRANSFER, "調撥單號", "物資管理-資產調撥",
                "DB", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入/修正调拨单号规则种子数据 (DB + YYYYMMDD + 4位)");
            bizSeqService.refreshRules();
        }
    }

    /** 盘点任务编号 (PD+YYYYMMDD+4位) 规则种子 (v15) */
    private void seedEamInventoryRule() {
        int inserted = jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_INVENTORY, "盤點任務編號", "物資管理-資產盤點",
                "PD", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入/修正盘点任务编号规则种子数据 (PD + YYYYMMDD + 4位)");
            bizSeqService.refreshRules();
        }
    }

    /** 遗失编号 (YS+YYYYMMDD+4位) + 报废编号 (BF+YYYYMMDD+4位) 规则种子 (v17) */
    private void seedEamLossScrapRules() {
        int inserted = 0;
        inserted += jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_LOSS, "遺失編號", "物資管理-遺失資產",
                "YS", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        inserted += jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), "
                        + "prefix = VALUES(prefix), date_format = VALUES(date_format), "
                        + "seq_length = VALUES(seq_length), seq_start = VALUES(seq_start), "
                        + "remark = VALUES(remark), status = VALUES(status)",
                BizSeqService.RULE_EAM_SCRAP, "報廢編號", "物資管理-報廢資產",
                "BF", "YYYYMMDD", 4, 0, 1,
                "{prefix} + YYYYMMDD + {n}位自增序號");
        if (inserted > 0) {
            log.info("已写入/修正遗失 + 报废编号规则种子数据 (YS/BF + YYYYMMDD + 4位)");
            bizSeqService.refreshRules();
        }
    }

    /**
     * 投流廣告算法ID前綴 SFLL → SFTL + 銷售定價編號規則登記補全 (seq:init-v18)。
     * <p>
     * 前缀是编号的业务语义（投流 → SFTL，旧 SFLL 是「流量」拼写），因此除了改规则行，还必须：
     * 1) 沿用 sys_biz_seq 旧前缀计数，否则切换后同日序号从 000 重起会重号；
     * 2) 回填已生成的算法编号与订单快照，否则算法下拉（value=algoCode）与存量订单对不上；
     * 3) upsert 5 个广告定价规则，保证「銷售定價」菜单下每个广告定价都能在「編號生成規則」查到依据。
     * 全部语句幂等，重复执行无副作用。
     */
    private void migrateTrafficAlgoPrefixAndPricingMenu() {
        // 前缀唯一键（uk_seq_rule_prefix）冲突时只跳过改名并 loudly 记录，不抛异常：
        // 本方法在 CommandLineRunner 内执行，抛异常会导致容器反复重启。
        Integer occupied = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE prefix = ? AND rule_key <> ?",
                Integer.class, TRAFFIC_ALGO_PREFIX, RULE_ALGO_TRAFFIC);
        int algoRule = 0;
        int seqCarried = 0;
        int algoCodes = 0;
        int orderCodes = 0;
        if (occupied != null && occupied > 0) {
            log.error("編號規則前綴 {} 已被其它規則佔用, 跳過 algo_traffic 前綴改名(需人工處理)", TRAFFIC_ALGO_PREFIX);
        } else {
            algoRule = upsertRule(RULE_ALGO_TRAFFIC, "投流廣告算法ID", "算法庫", TRAFFIC_ALGO_PREFIX,
                    "YYYYMMDD", 3, 0, "{prefix} + YYYYMMDD + {n}位自增序號");
            seqCarried = carryOverSeqCounter(TRAFFIC_ALGO_OLD_PREFIX, TRAFFIC_ALGO_PREFIX);
            algoCodes = renameCodePrefix("biz_ad_algorithm", "algo_code",
                    TRAFFIC_ALGO_OLD_PREFIX, TRAFFIC_ALGO_PREFIX);
            orderCodes = renameCodePrefix("biz_ad_order", "algo_code",
                    TRAFFIC_ALGO_OLD_PREFIX, TRAFFIC_ALGO_PREFIX);
        }
        int pricingRules = 0;
        for (String[] r : PRICING_RULES) {
            pricingRules += upsertRule(r[0], r[1], PRICING_BIZ_MENU, r[2],
                    "YYYYMMDD", 3, 0, "{prefix} + YYYYMMDD + {n}位自增序號");
        }
        log.info("投流廣告編號規則遷移: 算法ID規則 {} 行 / 序號沿用 {} 行 / 算法編號回填 {} 行 / 訂單快照回填 {} 行 / 銷售定價規則 {} 行",
                algoRule, seqCarried, algoCodes, orderCodes, pricingRules);
        bizSeqService.refreshRules();
    }

    /**
     * 迁移后置校验：只断言确定性的「销售定价 5 条规则已登记归位」。
     * <p>
     * 前缀切换结果不在这里硬断言：它可能因前缀唯一键冲突被主动跳过，硬断言会让启动
     * 反复失败；该情况由任务内的 log.error 暴露并交人工处理。
     */
    private void verifyTrafficAlgoPrefixAndPricingMenu() {
        Integer trafficOk = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key = ? AND prefix = ?",
                Integer.class, RULE_ALGO_TRAFFIC, TRAFFIC_ALGO_PREFIX);
        if (trafficOk == null || trafficOk == 0) {
            log.warn("algo_traffic 前綴當前不是 {}, 請到「規則中心 → 編號生成規則」核對", TRAFFIC_ALGO_PREFIX);
        }
        Integer pricingOk = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key IN ('config_pricing_star', 'config_pricing_hot',"
                        + " 'config_pricing_revive', 'config_pricing_signboard', 'config_pricing_traffic') "
                        + "AND biz_menu = ? AND status = 1",
                Integer.class, PRICING_BIZ_MENU);
        if (pricingOk == null || pricingOk != PRICING_RULES.length) {
            throw new IllegalStateException("銷售定價編號規則未全部登記到「" + PRICING_BIZ_MENU + "」菜單: 實際 " + pricingOk + " 條");
        }
    }

    /**
     * 赠送ID口径收口 (seq:init-v19)。
     * <p>
     * 「新增赠送」可选的广告类型中，金字招牌与投流廣告此前既没有赠送ID编号规则、也无法生成赠送ID，
     * 而这两个模块的下单逻辑又确实在按 adType 查赠送天数抵扣，导致赠送能力断链。
     * 本迁移把 5 个赠送ID规则全部登记到「推廣贈送」菜单，并把存量不符合现行格式的赠送ID
     * 按创建日期重新取号（消费流水的赠送ID快照一并同步），最后清理旧生成器遗留的孤儿计数行。
     * 全部语句幂等，重复执行无副作用。
     */
    private void seedGiftRulesAndNormalizeGiftIds() {
        for (String[] r : GIFT_RULES) {
            // 前缀唯一键（uk_seq_rule_prefix）冲突时 upsert 会误改到占用该前缀的其它规则，必须先挡住：
            // 本方法在 CommandLineRunner 内执行，抛异常会导致容器反复重启，故跳过并 loudly 记录交人工处理。
            Integer occupied = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE prefix = ? AND rule_key <> ?",
                    Integer.class, r[2], r[0]);
            if (occupied != null && occupied > 0) {
                log.error("編號規則前綴 {} 已被其它規則佔用, 跳過 {} 規則登記(需人工處理)", r[2], r[0]);
                continue;
            }
            upsertRule(r[0], r[1], GIFT_BIZ_MENU, r[2], "YYYYMMDD", 4, 0, "{prefix} + YYYYMMDD + {n}位自增序號");
        }
        // 新增规则必须先失效规则缓存，否则 BizSeqService.next() 会认为规则未配置
        bizSeqService.refreshRules();
        int renamed = normalizeLegacyGiftIds();
        int orphanSeqRows = dropOrphanGiftSeqCounter();
        log.info("贈送ID口徑收口: 規則 {} 條 / 存量贈送ID回填 {} 筆 / 孤兒計數清理 {} 行",
                GIFT_RULES.length, renamed, orphanSeqRows);
    }

    /**
     * 存量赠送ID按现行规则重新取号，并同步消费流水快照。
     * 广告类型无对应编号规则时跳过并告警（不猜测前缀，避免造出错号）。
     */
    private int normalizeLegacyGiftIds() {
        if (!tableExists("biz_gift_record")) {
            return 0;
        }
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT id, gift_id, ad_type, created_at FROM biz_gift_record "
                        + "WHERE gift_id IS NULL OR gift_id NOT REGEXP '" + GIFT_ID_PATTERN + "' ORDER BY id");
        int renamed = 0;
        for (Map<String, Object> row : rows) {
            Long id = ((Number) row.get("id")).longValue();
            String oldCode = (String) row.get("gift_id");
            String adType = (String) row.get("ad_type");
            String ruleKey = BizSeqService.giftRuleKey(adType);
            if (ruleKey == null) {
                log.warn("贈送ID回填跳過: 記錄 {} 的廣告類型 {} 無對應編號規則（gift_id={}），請人工核對", id, adType, oldCode);
                continue;
            }
            String newCode = bizSeqService.next(ruleKey, toLocalDate(row.get("created_at")));
            jdbcTemplate.update("UPDATE biz_gift_record SET gift_id = ? WHERE id = ?", newCode, id);
            // 流水快照按外键同步（旧数据 gift_id 可能为 NULL，按快照值匹配会漏行）
            if (tableExists("biz_gift_consume")) {
                jdbcTemplate.update("UPDATE biz_gift_consume SET gift_id = ? WHERE gift_record_id = ?", newCode, id);
            }
            renamed++;
            log.info("贈送ID回填: {} → {}（記錄 {}，廣告類型 {}）", oldCode, newCode, id, adType);
        }
        return renamed;
    }

    /** 清理旧赠送ID生成器遗留的序号计数行（仅当已无任何规则使用该前缀，避免误删在用计数） */
    private int dropOrphanGiftSeqCounter() {
        if (!tableExists("sys_biz_seq")) {
            return 0;
        }
        Integer inUse = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE prefix = ?", Integer.class, LEGACY_GIFT_SEQ_PREFIX);
        if (inUse != null && inUse > 0) {
            return 0;
        }
        return jdbcTemplate.update("DELETE FROM sys_biz_seq WHERE prefix = ?", LEGACY_GIFT_SEQ_PREFIX);
    }

    /**
     * 迁移后置校验：5 条赠送ID规则已登记归位，且可映射广告类型的存量赠送ID都已符合现行格式。
     * 校验失败不记版本、下次启动重试。
     */
    private void verifyGiftRulesAndGiftIds() {
        Integer ruleOk = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM sys_biz_seq_rule WHERE rule_key IN ('gift_new_store','gift_popular','gift_revive',"
                        + " 'gift_signboard','gift_traffic') AND biz_menu = ? AND status = 1",
                Integer.class, GIFT_BIZ_MENU);
        if (ruleOk == null || ruleOk != GIFT_RULES.length) {
            throw new IllegalStateException("贈送ID編號規則未全部登記到「" + GIFT_BIZ_MENU + "」菜單: 實際 " + ruleOk + " 條");
        }
        if (!tableExists("biz_gift_record")) {
            return;
        }
        Integer legacy = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM biz_gift_record WHERE ad_type IN ('new_store','revival','popular_merchant','ka',"
                        + "'golden_signboard','traffic_ad') AND (gift_id IS NULL OR gift_id NOT REGEXP '"
                        + GIFT_ID_PATTERN + "')",
                Integer.class);
        if (legacy != null && legacy > 0) {
            throw new IllegalStateException("仍有 " + legacy + " 筆存量贈送ID不符合現行格式，未回填完成");
        }
    }

    /** 按 rule_key 幂等写入/修正编号规则（前缀、日期格式、序号位数、所属菜单一并覆盖） */
    private int upsertRule(String ruleKey, String ruleName, String bizMenu, String prefix,
                           String dateFormat, int seqLength, int seqStart, String remark) {
        return jdbcTemplate.update(
                "INSERT INTO sys_biz_seq_rule "
                        + "(rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?) "
                        + "ON DUPLICATE KEY UPDATE "
                        + "rule_name = VALUES(rule_name), biz_menu = VALUES(biz_menu), prefix = VALUES(prefix), "
                        + "date_format = VALUES(date_format), seq_length = VALUES(seq_length), "
                        + "seq_start = VALUES(seq_start), remark = VALUES(remark), status = VALUES(status)",
                ruleKey, ruleName, bizMenu, prefix, dateFormat, seqLength, seqStart, remark);
    }

    /**
     * 前缀改名后沿用旧前缀的序号计数（同 date_key 取较大值），避免新前缀从 000 起重号。
     * 逐行处理而非批量 UPDATE...JOIN：MySQL 同表子查询限制下更稳，且序号行数量级极小。
     */
    private int carryOverSeqCounter(String oldPrefix, String newPrefix) {
        if (!tableExists("sys_biz_seq")) {
            return 0;
        }
        List<Map<String, Object>> oldRows = jdbcTemplate.queryForList(
                "SELECT date_key, current_value FROM sys_biz_seq WHERE prefix = ?", oldPrefix);
        int moved = 0;
        for (Map<String, Object> row : oldRows) {
            String dateKey = (String) row.get("date_key");
            int oldValue = ((Number) row.get("current_value")).intValue();
            // queryForList 而非 queryForObject：新前綴尚未計數時無行，queryForObject 會拋 EmptyResult
            List<Integer> current = jdbcTemplate.queryForList(
                    "SELECT current_value FROM sys_biz_seq WHERE prefix = ? AND date_key = ?",
                    Integer.class, newPrefix, dateKey);
            Integer newValue = current.isEmpty() ? null : current.get(0);
            if (newValue == null) {
                moved += jdbcTemplate.update(
                        "UPDATE sys_biz_seq SET prefix = ? WHERE prefix = ? AND date_key = ?",
                        newPrefix, oldPrefix, dateKey);
            } else if (oldValue > newValue) {
                moved += jdbcTemplate.update(
                        "UPDATE sys_biz_seq SET current_value = ? WHERE prefix = ? AND date_key = ?",
                        oldValue, newPrefix, dateKey);
            }
        }
        return moved;
    }

    /** 存量业务编号前缀改名（表/列不存在时跳过，返回回填行数） */
    private int renameCodePrefix(String table, String column, String oldPrefix, String newPrefix) {
        if (!tableExists(table) || !columnExists(table, column)) {
            return 0;
        }
        return jdbcTemplate.update(
                "UPDATE " + table + " SET " + column + " = CONCAT('" + newPrefix + "', SUBSTRING(" + column + ", "
                        + (oldPrefix.length() + 1) + ")) WHERE " + column + " LIKE ?",
                oldPrefix + "%");
    }

    /** 表不存在时跳过（表由各自脚本/初始化器创建），列不存在时追加 */
    private void ensureColumn(String table, String column, String definition) {
        if (!tableExists(table) || columnExists(table, column)) {
            return;
        }
        jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
        log.info("已为表 {} 补充编号字段 {}", table, column);
    }

    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.TABLES "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                Integer.class, table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
        return count != null && count > 0;
    }
}
