-- 127_oa_workflow_type_fix.sql
-- 修复 OA 流程 workflow_type 与前端 workflowKey 不匹配的问题
-- 根因：前端工作流编辑器以 process_code（如 oa_purchase）为 key 保存配置到 biz_workflow_config，
--       但后端 resolveDynamicNodes 使用 biz_oa_process.workflow_type（统一为 oa_general）查找配置，
--       导致前后端 key 不一致，配置永远读不到最新值。

-- Step 1: 将每个 OA 流程的 workflow_type 改为其自身的 process_code，与前端 workflowKey 对齐
UPDATE biz_oa_process SET workflow_type = 'oa_leave'     WHERE process_code = 'oa_leave'     AND workflow_type <> 'oa_leave';
UPDATE biz_oa_process SET workflow_type = 'oa_reimburse'  WHERE process_code = 'oa_reimburse' AND workflow_type <> 'oa_reimburse';
UPDATE biz_oa_process SET workflow_type = 'oa_purchase'   WHERE process_code = 'oa_purchase'  AND workflow_type <> 'oa_purchase';
UPDATE biz_oa_process SET workflow_type = 'oa_seal'       WHERE process_code = 'oa_seal'      AND workflow_type <> 'oa_seal';
UPDATE biz_oa_process SET workflow_type = 'oa_general'    WHERE process_code = 'oa_general'   AND workflow_type <> 'oa_general';

-- Step 2: 为各 OA 流程创建 biz_workflow_config 记录（若不存在），
--         并继承原 oa_general 的节点配置（如有），保证前端保存/读取都有对应记录
INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description, nodes_config, routing_rules)
SELECT 'oa_leave', '請假申請', 1, '員工請假申請流程',
       og.nodes_config, og.routing_rules
FROM biz_workflow_config og WHERE og.flow_type = 'oa_general'
LIMIT 1;

INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description, nodes_config, routing_rules)
SELECT 'oa_reimburse', '報銷申請', 1, '費用報銷申請流程',
       og.nodes_config, og.routing_rules
FROM biz_workflow_config og WHERE og.flow_type = 'oa_general'
LIMIT 1;

INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description, nodes_config, routing_rules)
SELECT 'oa_purchase', '採購申請', 1, '辦公物資採購申請流程',
       og.nodes_config, og.routing_rules
FROM biz_workflow_config og WHERE og.flow_type = 'oa_general'
LIMIT 1;

INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description, nodes_config, routing_rules)
SELECT 'oa_seal', '用章申請', 1, '公章使用申請流程',
       og.nodes_config, og.routing_rules
FROM biz_workflow_config og WHERE og.flow_type = 'oa_general'
LIMIT 1;

-- Step 3: 验证
SELECT process_code, workflow_type FROM biz_oa_process ORDER BY sort_order;
SELECT flow_type, flow_name FROM biz_workflow_config ORDER BY flow_type;
