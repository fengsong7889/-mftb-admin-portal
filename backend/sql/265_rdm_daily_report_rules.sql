-- 265: 日报改为「多规则 + 按项目/迭代范围」模型
--
-- 参照文档：实际幂等执行由 RdmSchemaMigrationInitializer 的 rdm:schema:v3.19 负责
-- （建表用 CREATE TABLE IF NOT EXISTS、补列逐列 columnExists 先查再加、
--   换唯一键用 indexExists 判定、后置校验全部通过才记版本）。
--
-- 为什么要改模型：原设计是全局单条配置（每天两档、覆盖全部在途项目）。
-- 实际使用是「A 產品盯 A 項目下的 B1 迭代、B 產品盯 B 項目下的 C1 迭代、
-- W 項目經理盯整個 W 項目」——目标、时间、模板都按项目/迭代不同，单条配置无法表达。
-- 因此拆成「全局开关（原 config 单行表）+ 多条规则（新表）」：
--   全局开关：总开关 / 群报开关 / 个人通知开关 / 各档默认模板
--   规则：项目 + 可选迭代 + 推送时间 + 内容档位 + 群报模板 + 个人模板 + 启停
--
-- ── 1. 推送规则表（可建多条）─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rdm_daily_report_rule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    name VARCHAR(100) NOT NULL COMMENT '规则名称（如「A產品-B1迭代日報」）',
    project_id BIGINT NOT NULL COMMENT '目标项目ID（来自项目总览）',
    iteration_code VARCHAR(32) DEFAULT NULL COMMENT '目标迭代编码；NULL=该项目全部迭代',
    push_time VARCHAR(5) NOT NULL COMMENT '推送时间 HH:mm',
    content_type VARCHAR(16) NOT NULL DEFAULT 'morning' COMMENT '内容档位: morning=今日焦点 / evening=当日复盘',
    group_template_key VARCHAR(64) DEFAULT NULL COMMENT '群报模板键（空=按档位默认模板）',
    personal_template_key VARCHAR(64) DEFAULT NULL COMMENT '个人通知模板键（空=按档位默认模板）',
    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用 0/1',
    remark VARCHAR(500) DEFAULT NULL COMMENT '说明',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_rdm_daily_report_rule_project (project_id, deleted),
    KEY idx_rdm_daily_report_rule_time (enabled, push_time, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='RDM进度日报推送规则（一条规则=项目+可选迭代+时间+档位+模板，可建多条）';

-- ── 2. 快照表补范围列 ──────────────────────────────────────────────
-- scope_key 是新的幂等维度：规则推送写 rule:{id}，手动触发写 manual:{projectId}:{iterationCode}。
-- 没有它就分不清「同一天同一档的两份快照分别属于哪条规则/哪个项目」。
ALTER TABLE rdm_daily_report
    ADD COLUMN scope_key VARCHAR(64) NOT NULL DEFAULT ''
        COMMENT '范围键：规则=rule:{id}，手动=manual:{projectId}:{iterationCode}；唯一键用它区分同日多份'
        AFTER trigger_by;
ALTER TABLE rdm_daily_report
    ADD COLUMN rule_id BIGINT DEFAULT NULL COMMENT '推送规则ID（手动触发为 NULL）' AFTER scope_key;
ALTER TABLE rdm_daily_report
    ADD COLUMN project_id BIGINT DEFAULT NULL COMMENT '快照目标项目ID' AFTER rule_id;
ALTER TABLE rdm_daily_report
    ADD COLUMN iteration_code VARCHAR(32) DEFAULT NULL COMMENT '快照目标迭代编码（NULL=项目全部迭代）' AFTER project_id;

-- 存量行回填：空 scope_key 的旧行按 id 各自成键，否则新唯一键会把它们判成互相重复。
UPDATE rdm_daily_report SET scope_key = CONCAT('legacy:', id)
 WHERE scope_key = '' OR scope_key IS NULL;

-- ── 3. 换唯一键 ────────────────────────────────────────────────────
-- 旧的 (report_date, report_type) 全局唯一会挡住「同一天第二条规则」的写入
-- （直接报 Duplicate entry），必须移除；这是硬阻碍，不是可选优化。
-- 建表至今无生产数据（功能尚未上线），换键不丢任何业务事实；DROP INDEX 只改元数据。
ALTER TABLE rdm_daily_report DROP INDEX uk_rdm_daily_report;

ALTER TABLE rdm_daily_report
    ADD UNIQUE KEY uk_rdm_daily_report_scope (report_date, report_type, scope_key);
