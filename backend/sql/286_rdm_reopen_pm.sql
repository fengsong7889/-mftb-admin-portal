-- 286: 驳回后允许本单受理产品经理重新打开
--
-- 说明：本文件为一次性参考文档，真实配置变更内联在
-- RdmSchemaMigrationInitializer（rdm:schema:v3.32）中，不参与启动执行。
--
-- 背景：rejected → intake_pending 的 reopen 动作原先只允许 SUBMITTER / PMO / DISPATCHER，
-- 产品经理驳回后无法撤销自己的决定；改派给新 PM 后，新 PM 也只能查看、不能推进。
-- 变更：allowed_roles 增加 PM。权限仍由 activeRoles（本单 PM 角色行）收敛，不是全局放开。
-- 幂等：用逗号包裹后精确匹配 PM；不能写 LIKE '%PM%'（PMO 含 PM 子串，会误判为已包含）。
UPDATE rdm_transition
SET allowed_roles = 'SUBMITTER,PMO,DISPATCHER,PM'
WHERE from_status = 'rejected'
  AND to_status = 'intake_pending'
  AND action_code = 'reopen'
  AND status = 1
  AND CONCAT(',', allowed_roles, ',') NOT LIKE '%,PM,%';
