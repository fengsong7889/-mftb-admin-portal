-- 241: 免审批直送的落点真值回收 —— rdm_transition 补登 resubmit_pool
--      一次性参考文档；实际执行与幂等由 RdmSchemaMigrationInitializer（版本键 rdm:transition:v1.0）负责。
--      方言：MySQL 8.x，INSERT IGNORE 可重复执行。
--
-- 背景（需求提交/需求管理拆分 · 未完成清单第 4 项）：
--   批次 1 把免审批需求的落点写在 Java 里（pool / assigned 二选一），于是管理员在
--   「需求配置 › 狀態與流轉」里停用或改落点时，免审批路径仍照旧放行 —— 违反本仓库的既定口径
--   「状态机真值：rdm_status_def + rdm_transition，不在代码里硬编码流转」。
--   现在免审批分支改为读配置基落点，缺行/停用一律 fail-closed 拒提交：
--   「不得把缺配置当成审批已完成或自动免审」（方案 §四 明文）。
--
-- 落点形状与 OA 终审回调完全同构：配置给基落点 pool，代码再按「提交时已指定且仍有效的
-- 意向产品」细化为 assigned（对应回调的 approve_intake→pool + applyIntentPm→assigned）。
-- 因此配置只需要给出 pool，不需要为 assigned 另造状态机分支。

-- ── 1. 免审批重提直送需求池（草稿提交用的 submit_pool 早在 204 已种，这里只做兵底） ──
-- allowed_roles 只给 SUBMITTER：免审批直送是提出人自己的提交动作，不得扩给审批岗。
INSERT IGNORE INTO rdm_transition
    (from_status, to_status, action_code, action_name, allowed_roles, required_fields, sort_order, status)
VALUES
    ('draft', 'pool', 'submit_pool', '免審批直送需求池', 'SUBMITTER', '', 2, 1),
    ('intake_rejected', 'pool', 'resubmit_pool', '免審批重提直送需求池', 'SUBMITTER', '', 6, 1);

-- ── 2. 回滚说明 ────────────────────────────────────────────────────────────
-- 本脚本只 ADD 种子行，不改任何存量流转与历史留痕。回滚 = 回退代码（免审批落点回到代码内定），
-- 种子行留着无害：submit_pool/resubmit_pool 只被免审批分支读取，不会被前端操作区误当成新按钮
-- （前端操作区按当前状态 + 角色过滤，SUBMITTER 在 draft 上本来就能看到 submit）。
-- 刻意不软删这两行来「回滚」，否则回退后的代码与残留配置会给出两套落点口径。
