-- 242: RDM 延迟发号 v2 —— 正式需求编号改为「产品经理认领时」生成
--
-- 本文件仅作参考文档：实际执行、幂等与后置校验由
-- RdmSchemaMigrationInitializer.doClaimReqNoMigrate() / verifyClaimReqNo() 负责，
-- 版本键 rdm:schema:v3.5（已登记 db/migrations/catalog.json）。
--
-- 背景：v3.4（240 号脚本）把发号时机定在「首次准入成功」，但进入 assigned 有两条路径 ——
-- 产品经理自需求池「认领」（claim）与项目经理「分配/改派」（batch-assign / reassign）。
-- v3.5 把发号收口到认领，于是 pool / assigned 必须允许 req_no 为 NULL，
-- 否则分配路径上的需求一推进到 evaluating 就会被 CHECK 打回，
-- 用户只看到「數據庫操作異常, 請稍後重試」。
-- 服务侧同时在 transitionInternal 增加补号闸门：目标状态不在白名单时同一条 UPDATE 内补号，
-- 覆盖存量无号数据，避免再次出现「已准入却无号」的中间态。
--
-- MySQL 8 没有 DROP CHECK IF EXISTS，Java 侧先查 information_schema.TABLE_CONSTRAINTS
-- 且要求 ENFORCED='YES'（不被强制的 CHECK 等于不存在，登记成已迁移比没有更危险）。

-- 1. 放宽 CHECK：准入前三态 + pool / assigned 允许无编号
ALTER TABLE rdm_requirement DROP CHECK ck_rdm_req_no_admitted;

ALTER TABLE rdm_requirement
    ADD CONSTRAINT ck_rdm_req_no_admitted
    CHECK (status IN ('assigned', 'draft', 'intake_pending', 'intake_rejected', 'pool')
           OR req_no IS NOT NULL);

-- 2. 刷新需求编号规则说明（前缀/位数/流水起点与历史号码一律不动，只改生成时机口径）
UPDATE sys_biz_seq_rule
   SET remark = '{prefix} + YYYYMMDD + {n}位自增序號。生成時機：產品經理認領（claim）時首次生成，審批通過/免審提交不預佔、不消費流水；存量已生成號碼保持不變。'
 WHERE rule_key = 'rdm_requirement';
