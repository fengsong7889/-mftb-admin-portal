-- 262: RDM 每日钉钉日报（快照 + 配置 + 模板）与项目编号规则改 PROJ
--
-- 参照文档：实际幂等执行由 RdmSchemaMigrationInitializer 的 rdm:schema:v3.16 负责
-- （CREATE TABLE IF NOT EXISTS 可安全重放，后置校验三表就绪才记版本；
--   sys_biz_seq_rule 规则行为幂等 UPDATE，重复执行结果一致）。
--
-- 为什么要这三张表：产研交付需要每日定时把「项目 → 迭代 → 需求」进度同步到钉钉群，
-- 并定向推送给项目经理/产品负责人。三张表各管一件事：
--   · rdm_daily_report         当日权威快照（通知与详情页同源，杜绝「通知数字≠打开页面数字」）
--   · rdm_daily_report_config  推送时间/开关/接收范围/选用模板（页面可配，改后即时生效无需重启）
--   · rdm_daily_report_template 推送模板（预置 7 套供选用，用户可微调另存）
--
-- 快照表口径（重要）：report_type 有 morning / evening / manual 三值，唯一键
-- uk_rdm_daily_report(report_date, report_type) 即「每天每档一行」，这既是幂等兜底
-- （多实例并发 tick、重启补跑都不会重发），也是详情页按日期取数的唯一口径。
-- **定时与手动写入不同的 report_type**：定时只写 morning/evening（受唯一键幂等保护），
-- 手动触发写 manual（不被定时幂等拦住，因为补发本来就是合法语义）；两者各自一行、
-- 各自自洽，通知里的链接指向自己那一行，因此不会出现「同一天两份互相矛盾的口径」。
-- 触发方式与人记在 trigger_type / trigger_by / push_count，重复手动补发累加次数并覆盖同一行。
--
-- content_json / group_content 用 MEDIUMTEXT 而非 JSON 类型：沿用本仓既有口径
-- （259 的 evidence_json 同构），存序列化后的 JSON 字符串，读侧整取整解析，
-- 不做 JSON_EXTRACT 局部查询，因此不需要 JSON 类型的函数索引能力。

-- ── 1. 日报快照表 ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rdm_daily_report (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    report_date DATE NOT NULL COMMENT '日报日期（快照口径日）',
    report_type VARCHAR(16) NOT NULL COMMENT '档位: morning=晨报 / evening=晚报 / manual=手动触发',
    project_count INT NOT NULL DEFAULT 0 COMMENT '快照覆盖的在途项目数',
    content_json MEDIUMTEXT COMMENT '快照JSON：项目→迭代→需求层级 + 项目级指标 + 汇总计数',
    group_title VARCHAR(200) DEFAULT NULL COMMENT '群报标题快照（渲染后）',
    group_content MEDIUMTEXT COMMENT '群报正文快照（渲染后 markdown，与实发内容一致）',
    personal_count INT NOT NULL DEFAULT 0 COMMENT '个人工作通知接收人数（已绑定钉钉 userId 者）',
    push_count INT NOT NULL DEFAULT 0 COMMENT '累计推送次数（含手动补发）',
    trigger_type VARCHAR(16) DEFAULT NULL COMMENT '最近一次触发方式: schedule/manual',
    trigger_by VARCHAR(64) DEFAULT NULL COMMENT '最近一次手动触发人姓名快照（定时为 NULL）',
    last_push_at DATETIME DEFAULT NULL COMMENT '最近一次推送时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_daily_report (report_date, report_type),
    KEY idx_rdm_daily_report_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM每日日报快照（每天每档一行，通知与详情页同源）';

-- ── 2. 推送配置表（单行）───────────────────────────────────────────────
-- config_slot 恒为 'default' 且带唯一键：用数据库约束保证「全表只有一行配置」，
-- 避免多行造成口径分裂（作业读到哪一行？）。页面保存走 UPSERT 同一行。
CREATE TABLE IF NOT EXISTS rdm_daily_report_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    config_slot VARCHAR(16) NOT NULL DEFAULT 'default' COMMENT '配置槽位（恒为 default，唯一键保证单行）',
    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '日报总开关 0/1',
    morning_time VARCHAR(5) NOT NULL DEFAULT '09:00' COMMENT '晨报推送时间 HH:mm',
    evening_time VARCHAR(5) NOT NULL DEFAULT '18:00' COMMENT '晚报推送时间 HH:mm',
    group_enabled TINYINT NOT NULL DEFAULT 1 COMMENT '群报开关 0/1',
    personal_enabled TINYINT NOT NULL DEFAULT 1 COMMENT '个人工作通知开关 0/1',
    receiver_scope VARCHAR(16) NOT NULL DEFAULT 'all_projects' COMMENT '接收范围: all_projects=全部在途项目 / risk_only=仅风险逾期项目',
    morning_template_key VARCHAR(64) DEFAULT NULL COMMENT '晨报选用模板键（空=用该档默认模板）',
    evening_template_key VARCHAR(64) DEFAULT NULL COMMENT '晚报选用模板键（空=用该档默认模板）',
    personal_template_key VARCHAR(64) DEFAULT NULL COMMENT '个人通知选用模板键（空=用默认模板）',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人姓名快照',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_daily_report_config (config_slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM日报推送配置（单行：时间/开关/接收范围/选用模板）';

-- ── 3. 推送模板表 ──────────────────────────────────────────────────────
-- is_preset=1 的预置模板不可删（只可停用），保证「一键恢复默认」永远有底；
-- 用户微调后另存为 is_preset=0 的自建模板，可删可改。
CREATE TABLE IF NOT EXISTS rdm_daily_report_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    template_key VARCHAR(64) NOT NULL COMMENT '模板键（唯一，配置表按此引用）',
    name VARCHAR(100) NOT NULL COMMENT '模板名称',
    channel VARCHAR(16) NOT NULL COMMENT '投放通道: group=钉钉群 / personal=工作通知',
    report_type VARCHAR(16) NOT NULL DEFAULT 'morning' COMMENT '适用档位: morning/evening/any',
    title_tpl VARCHAR(200) NOT NULL COMMENT '标题模板（含占位符）',
    content_tpl TEXT NOT NULL COMMENT '正文模板（markdown + 占位符，只做字符串替换不 eval）',
    is_preset TINYINT NOT NULL DEFAULT 0 COMMENT '是否预置模板 0/1（预置不可删）',
    is_default TINYINT NOT NULL DEFAULT 0 COMMENT '是否该 channel+report_type 的默认模板 0/1',
    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用 0/1',
    remark VARCHAR(500) DEFAULT NULL COMMENT '说明',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_daily_report_template (template_key),
    KEY idx_rdm_daily_report_template_use (channel, report_type, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RDM日报推送模板（预置7套，用户可微调另存）';

-- ── 4. 预置模板种子（INSERT IGNORE 幂等：已存在同 key 不覆盖用户改动）──
-- 占位符清单见 RdmDailyReportTemplateRenderer；未知占位符渲染时保留原样并记日志。
INSERT IGNORE INTO rdm_daily_report_template
    (template_key, name, channel, report_type, title_tpl, content_tpl, is_preset, is_default, enabled, remark, created_by, updated_by)
VALUES
    ('group_morning_overview', '群報·晨報 A 總覽優先', 'group', 'morning',
     '產研交付日報 {{reportDate}}（晨報）',
     '## 📊 產研交付日報 {{reportDate}}（{{reportTypeLabel}}）\n**在途項目 {{projectCount}} 個**｜今日到期 {{todayDueCount}}｜已逾期 {{overdueCount}}｜風險 {{riskCount}}\n\n{{projectBlock}}\n\n[查看完整日報]({{detailUrl}})',
     1, 1, 1, '管理者視角預設：先匯總指標再看項目明細，適合每日晨會前閱讀', 'system', 'system'),
    ('group_morning_risk', '群報·晨報 B 風險優先', 'group', 'morning',
     '產研交付日報 {{reportDate}}（晨報·風險優先）',
     '## ⚠️ 產研交付日報 {{reportDate}}（{{reportTypeLabel}}）\n**需關注：逾期 {{overdueCount}}｜風險 {{riskCount}}｜今日到期 {{todayDueCount}}**\n\n{{riskBlock}}\n\n其餘 {{normalProjectCount}} 個項目進展正常。\n[查看完整日報]({{detailUrl}})',
     1, 0, 1, '只展開逾期/風險/臨期項目，正常項目折疊為一行計數，適合項目多時聚焦異常', 'system', 'system'),
    ('group_morning_brief', '群報·晨報 C 精簡版', 'group', 'morning',
     '產研交付日報 {{reportDate}}',
     '## 📊 產研交付日報 {{reportDate}}\n在途 {{projectCount}}｜今日到期 {{todayDueCount}}｜逾期 {{overdueCount}}｜風險 {{riskCount}}\n[查看完整日報]({{detailUrl}})',
     1, 0, 1, '只有匯總與連結，訊息最短，適合項目數多時避免刷屏', 'system', 'system'),
    ('group_evening_review', '群報·晚報 D 當日復盤', 'group', 'evening',
     '產研交付晚報 {{reportDate}}',
     '## 🌙 產研交付晚報 {{reportDate}}\n**今日完成 {{todayDoneCount}} 項**｜今日上線 {{todayReleasedCount}}｜狀態變更 {{todayChangedCount}}\n\n{{projectBlock}}\n\n**明日到期 {{tomorrowDueCount}} 項**，請提前安排。\n[查看完整日報]({{detailUrl}})',
     1, 1, 1, '收工前復盤：當日完成/上線/狀態變更 + 明日到期預警', 'system', 'system'),
    ('group_evening_brief', '群報·晚報 E 精簡復盤', 'group', 'evening',
     '產研交付晚報 {{reportDate}}',
     '## 🌙 產研交付晚報 {{reportDate}}\n今日完成 {{todayDoneCount}}｜上線 {{todayReleasedCount}}｜狀態變更 {{todayChangedCount}}\n**明日到期 {{tomorrowDueCount}} 項**\n[查看完整日報]({{detailUrl}})',
     1, 0, 1, '同 D 但去掉項目明細，只留當日匯總與明日預警', 'system', 'system'),
    ('personal_todo', '個人·F 待辦視角', 'personal', 'any',
     '您的產研交付日報 {{reportDate}}',
     '### 📌 {{userName}}，您的產研交付日報（{{reportDate}} {{reportTypeLabel}}）\n- 負責項目：**{{myProjectCount}} 個**\n- 待處理：**{{myTodoCount}} 項**（逾期 {{myOverdueCount}}）\n- 今日到期：**{{myTodayDueCount}} 項**\n\n{{myProjectBlock}}\n\n[查看我的項目日報]({{detailUrl}})',
     1, 1, 1, '推給項目經理/產品負責人：一打開就知道今天該推什麼', 'system', 'system'),
    ('personal_overview', '個人·G 總覽視角', 'personal', 'any',
     '您的產研交付日報 {{reportDate}}',
     '### 📋 {{userName}}，您負責項目的完整進度（{{reportDate}} {{reportTypeLabel}}）\n- 負責項目：**{{myProjectCount}} 個**\n- 需求：**{{myRequirementCount}} 個**（已完成 {{myRequirementDoneCount}}）\n- 交付項：**{{myDeliveryCount}} 項**（已完成 {{myDeliveryDoneCount}}，剩餘 {{myRemainingCount}}）\n\n{{myProjectBlock}}\n\n[查看我的項目日報]({{detailUrl}})',
     1, 0, 1, '列出負責項目的迭代/需求/交付項完整進度，資訊最全但訊息較長', 'system', 'system');

-- ── 5. 默认配置种子（单行；INSERT IGNORE 不覆盖用户已改的配置）─────────
INSERT IGNORE INTO rdm_daily_report_config
    (config_slot, enabled, morning_time, evening_time, group_enabled, personal_enabled,
     receiver_scope, morning_template_key, evening_template_key, personal_template_key, updated_by)
VALUES
    ('default', 1, '09:00', '18:00', 1, 1,
     'all_projects', 'group_morning_overview', 'group_evening_review', 'personal_todo', 'system');

-- ── 6. 日报工作通知场景种子 ────────────────────────────────────────────
-- 个人直发走钉钉企业内部应用的工作通知，场景路由由 sys_notification_scenario 承载。
-- 沿用会议模块口径：app_id=NULL 且 enabled=0 插入——路由必须由管理员在
-- 「通知渠道配置」页显式绑定应用并开启，不回填默认应用；INSERT IGNORE 保证
-- 发版重跑不会把管理员已开启的场景关掉。未绑定时日报作业跳过个人通知，群报不受影响。
INSERT IGNORE INTO sys_notification_scenario (scenario_key, app_id, enabled, updated_by)
VALUES ('rdm_daily_report', NULL, 0, 'system');

-- ── 7. 项目编号规则改 PROJ + 年月日 + 2 位日流水 ───────────────────────
-- 目标格式：PROJ2026101901（当日第二个 PROJ2026101902，超 99 自然扩位为 …100，不截断不循环）。
-- 幂等 UPDATE：重复执行结果一致；BizSeqService 按 (prefix, 日期段) 行锁自增、每日从 seq_start 重置，
-- 因此改 prefix 后当日流水自然从 01 起，发号代码零改动（RdmProjectService 仍调 next("rdm_project")）。
--
-- 存量编号不改写：历史 PJ… 号是既成事实（已被历史钉钉通知、审批快照、已发链接引用），
-- 改写会造成追溯断链；project_no 唯一键 uk_project_no 下新旧前缀可共存。
-- 规则行登记在 sys_biz_seq_rule，即「平台支撐系統 > 規則配置 > 編號生成規則」菜单的数据源，
-- 改完即在该页可见，满足后续查看追溯要求。
UPDATE sys_biz_seq_rule
   SET prefix = 'PROJ',
       seq_length = 2,
       seq_start = 1,
       rule_name = '項目編號',
       biz_menu = '產研交付',
       status = 1,
       remark = '{prefix} + YYYYMMDD + 至少2位自增序號：每日從 01 起，超過 99 自然擴位為 100，不截斷、不循環複用（如 PROJ2026101901）。生成時機：新建項目時由系統發號，前端不收手工輸入。存量 PJ 開頭的歷史項目編號為既成事實，保持不變、不改寫。',
       updated_at = NOW()
 WHERE rule_key = 'rdm_project';
