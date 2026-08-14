-- 40_approval_nodes.sql
-- 审批引擎升级：支持动态审批节点 + 路由规则
-- 1. biz_workflow_config 新增节点配置和路由规则字段
-- 2. biz_fin_approval 新增实际审批节点实例字段

-- ═══════════════════════════════════════════════════════
-- 1. biz_workflow_config 扩展：存储前端编排的节点配置和路由规则
-- ═══════════════════════════════════════════════════════
ALTER TABLE biz_workflow_config
  ADD COLUMN nodes_config TEXT NULL COMMENT '审批节点配置JSON（WorkflowNode[]）' AFTER description,
  ADD COLUMN routing_rules TEXT NULL COMMENT '路由规则JSON（RoutingRule[]）' AFTER nodes_config;

-- ═══════════════════════════════════════════════════════
-- 2. biz_fin_approval 扩展：存储每次提交解析出的实际节点实例
-- ═══════════════════════════════════════════════════════
ALTER TABLE biz_fin_approval
  ADD COLUMN approval_nodes TEXT NULL COMMENT '实际审批节点实例JSON' AFTER extra;

-- ═══════════════════════════════════════════════════════
-- approval_nodes JSON 结构示例：
-- [
--   {
--     "nodeId": "n1",
--     "nodeName": "業務主管審批",
--     "approvalRule": "any",
--     "approvers": [
--       { "userId": 2, "name": "馮松(MF00002)", "status": "pending", "time": null }
--     ]
--   },
--   {
--     "nodeId": "n3",
--     "nodeName": "財務主管審批",
--     "approvalRule": "all",
--     "approvers": [
--       { "userId": 5, "name": "Bee(MF00001)", "status": "pending", "time": null },
--       { "userId": 3, "name": "李世民(003)", "status": "pending", "time": null }
--     ]
--   }
-- ]
--
-- approver status 枚举：
--   pending   = 待审批
--   approved  = 已通过
--   rejected  = 已驳回
--   skipped   = 已跳过（any模式下其他人通过后跳过）
-- ═══════════════════════════════════════════════════════
