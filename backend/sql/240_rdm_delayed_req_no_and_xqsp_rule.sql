-- 240: 需求提交与需求管理拆分 · 批次1 —— 正式需求编号延迟生成 + XQSP 审批流程编号规则
--      一次性参考文档；实际执行与幂等由 RdmSchemaMigrationInitializer（版本键 rdm:schema:v3.4）负责。
--      方言：MySQL 8.x（CHECK 约束自 8.0.16 起强制；5.7 会静默忽略，故本项目要求 8.x）。
--
-- 业务口径（用户确认，见方案「需求提交与需求管理职责拆分」§三/§四）：
--   1. 新需求的草稿 / 待审批 / 审批驳回阶段一律**不生成、不预占**正式需求编号；
--      首次准入成功（审批全部通过，或服务端免审批裁决命中）时才生成一次，此后不变。
--   2. 正式需求编号仍沿用既有 rdm_requirement 规则（XQ + YYYYMMDD + 4 位日流水），
--      本次只改「生成时机」，不改前缀、不改位数、不重置流水。
--   3. 需要审批的提交进入流程审批系统，流程编号独立为
--      XQSP + YYYYMMDD + 至少两位日流水：每日从 01 起，超 99 自然扩位为 100，不截断、不循环复用。
--      两套流水（XQ 与 XQSP）互不影响，均由 BizSeqService + biz_seq 行锁发号。
--   4. 免审批例外：提交成功且服务端确认免审时**立即**生成需求编号，不生成 XQSP 审批单。
--
-- 历史编号保护：本脚本只放开空值约束并登记规则，**不清空、不重排、不复用**任何存量
-- rdm_requirement.req_no 或已终审 OA 单号。存量在审批前已被预发号的历史单保持原号（列为「历史预发号」事实，处置另审）。

-- ── 1. req_no 放开 NOT NULL（准入前允许为空）──────────────────────────────
--    uk_rdm_req_no 唯一键保留：MySQL 唯一索引允许多条 NULL，因此「准入前无数条互不冲突、
--    已生成号码仍全局唯一」由同一把键同时保证，不需要另建部分索引。
ALTER TABLE rdm_requirement
    MODIFY COLUMN req_no VARCHAR(32) NULL DEFAULT NULL
    COMMENT '需求编号 XQ+YYYYMMDD+4位；仅首次准入成功（审批全通过或免审批）时生成，准入前为 NULL';

-- ── 2. 准入状态与编号的一致性约束 ────────────────────────────────────────
-- 2.1 除 draft / intake_pending / intake_rejected 三类「准入前」状态外，必须已存在正式需求编号。
--     撤回会落回 draft，所以「已撤回」不在此列之外；自定义新状态不得绕过本约束。
ALTER TABLE rdm_requirement
    ADD CONSTRAINT ck_rdm_req_no_admitted
    CHECK (status IN ('draft', 'intake_pending', 'intake_rejected') OR req_no IS NOT NULL);

-- 2.2 有值就必须是有效编号：禁止用空串、内部 ID 或 XQSP 号冒充正式需求号。
ALTER TABLE rdm_requirement
    ADD CONSTRAINT ck_rdm_req_no_blank
    CHECK (req_no IS NULL OR CHAR_LENGTH(TRIM(req_no)) > 0);

-- ── 3. XQSP 审批流程编号规则种子（幂等）──────────────────────────────────
--     rule_key 与 BizSeqService.RULE_RDM_INTAKE_APPROVAL 一致；
--     seq_length=2 是最少位数（BizSeqService 用 %02d 格式化，超过 99 时自然扩位为 100/101…）；
--     seq_start=1 表示每日首号为 01（seq_start=0 才会从 00 起）。
--     缺行时 OaRequestServiceImpl.submit() 对 rdm_intake 直接报「編號生成規則未配置」而拒绝提交，
--     不回落通用 OA 号 —— 宁可不给提交，也不能让审批单和编号规则页对不上。
INSERT IGNORE INTO sys_biz_seq_rule
    (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES
    ('rdm_intake_approval', '需求審批流程編號', '流程審批系統－需求審批', 'XQSP', 'YYYYMMDD', 2, 1, 1,
     '{prefix} + YYYYMMDD + 至少2位自增序號：每日從 01 起，超過 99 自然擴位為 100，不截斷、不循環複用。僅在需求正式提交且需要審批時為本輪生成；免審批需求不產生本編號。');

-- ── 4. 既有正式需求编号规则的说明对齐（不改格式与流水）────────────────────
--     204 号种子已登记 rdm_requirement，这里只刷新 remark，让「编号生成规则」页与延迟发号口径一致。
--     刻意用 UPDATE 而非 INSERT IGNORE：规则行早已存在，remark 是唯一需要跟随代码变化的字段。
UPDATE sys_biz_seq_rule
SET rule_name = '需求編號',
    biz_menu  = '流程審批系統－需求審批',
    remark    = '{prefix} + YYYYMMDD + {n}位自增序號。生成時機：首次准入成功（審批全部通過，或服務端免審批裁決命中）時生成一次，准入前的草稿/待審批/審批駁回不預佔、不消費流水；存量已生成號碼保持不變。'
WHERE rule_key = 'rdm_requirement';
