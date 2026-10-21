-- 275: 个人日报收件人可配（角色白名单 + 追加/排除名单）
-- 版本键: rdm:schema:v3.26
-- 幂等性由 Java 初始化器（RdmSchemaMigrationInitializer）保证：逐列查 INFORMATION_SCHEMA 后再加 + 后置校验。
-- 本文件仅作审计参考，不参与自动执行，不进镜像。

ALTER TABLE rdm_daily_report_config
  ADD COLUMN receiver_roles_json VARCHAR(255) NOT NULL DEFAULT '["pm","product_owner"]'
    COMMENT '收件角色白名单(JSON数组)：pm/product_owner/tech_lead/qa_lead/ui_designer/ops_lead/project_member' AFTER personal_enabled,
  ADD COLUMN extra_receiver_user_ids_json VARCHAR(2000) DEFAULT NULL
    COMMENT '追加收件人 sys_user.id(JSON数组)，收到规则范围全部项目汇总' AFTER receiver_roles_json,
  ADD COLUMN exclude_receiver_user_ids_json VARCHAR(2000) DEFAULT NULL
    COMMENT '排除收件人 sys_user.id(JSON数组)，优先级最高' AFTER extra_receiver_user_ids_json;

-- 语义说明
--   receiver_roles_json        默认 ["pm","product_owner"]，与改造前的实际发送对象逐字一致，
--                              升级当天不改变任何人的收件行为。
--   extra_..._json             追加收件人不靠项目角色推导，视角是「规则范围内全部项目汇总」。
--   exclude_..._json           优先级最高：先合并角色与追加，再整体剔除。
--   receiver_scope（v3.16）    从未被发送链路消费，本版起停止读写；列保留不删（生产禁止 DROP COLUMN）。

-- 回滚
--   代码回退即可：旧代码按固定列名读取，新增列被忽略，三列保留不影响任何逻辑。
--   确实要清理时才执行（生产环境禁止）：
--     ALTER TABLE rdm_daily_report_config
--       DROP COLUMN exclude_receiver_user_ids_json,
--       DROP COLUMN extra_receiver_user_ids_json,
--       DROP COLUMN receiver_roles_json;
