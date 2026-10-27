-- ============================================================
-- 103_mcp_tool.sql
-- MCP 工具注册表：AI 助手工具广场（MCP 服務）
-- 广场管「接入」（安装/卸载），AI 操作授權管「放行」（L0-L4 治理）
-- 冪等腳本，可重複執行
-- ============================================================

-- 1. 建表
CREATE TABLE IF NOT EXISTS mcp_tool (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tool_key VARCHAR(64) NOT NULL COMMENT '工具唯一標識（MCP tool name，下發模型的 function name）',
  name VARCHAR(100) NOT NULL COMMENT '工具名稱',
  category VARCHAR(32) NOT NULL DEFAULT 'finance' COMMENT '分類: finance=財務 promotion=推廣 merchant=商戶 ai=智能中心',
  description VARCHAR(500) NOT NULL COMMENT '能力描述（作為 tool description 下發給模型）',
  icon VARCHAR(64) NULL COMMENT '圖標名稱（MenuIcon 註冊表）',
  version VARCHAR(16) NOT NULL DEFAULT '1.0.0' COMMENT '工具版本',
  risk_level VARCHAR(4) NOT NULL DEFAULT 'L1' COMMENT '風險等級 L0~L4（與 AI 操作授權分級一致）',
  params_json TEXT NULL COMMENT '參數 JSON Schema（作為 parameters 下發給模型）',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否啟用: 1=啟用 0=停用',
  installed TINYINT NOT NULL DEFAULT 0 COMMENT '是否已安裝: 1=已安裝（AI 助手即刻具備該能力）',
  installed_by VARCHAR(64) NULL COMMENT '安裝人',
  installed_at DATETIME NULL COMMENT '安裝時間',
  sort INT NOT NULL DEFAULT 0 COMMENT '廣場排序',
  deleted TINYINT NOT NULL DEFAULT 0 COMMENT '邏輯刪除',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tool_key (tool_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MCP 工具註冊表（AI 助手工具廣場）';

-- 2. 種子工具：首批接入 2 個（已安裝）+ 1 個可安裝演示位
--    執行器復用前端 agent.ts 既有 handler，參數 Schema 與之一致
INSERT INTO mcp_tool (tool_key, name, category, description, icon, version, risk_level, params_json, enabled, installed, sort, deleted)
SELECT 'query_account_balance', '賬戶餘額查詢', 'finance',
       '查詢集團賬戶的推廣金餘額（虛擬餘額和實際餘額），可按集團名稱、品牌篩選',
       'WalletOutlined', '1.0.0', 'L1',
       '{"type":"object","properties":{"groupName":{"type":"string","description":"集團名稱（支持模糊匹配）"},"brand":{"type":"string","description":"品牌：1=閃蜂, 2=mFood","enum":["1","2"]}}}',
       1, 1, 1, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM mcp_tool WHERE tool_key = 'query_account_balance');

INSERT INTO mcp_tool (tool_key, name, category, description, icon, version, risk_level, params_json, enabled, installed, sort, deleted)
SELECT 'query_approvals', '審批狀態查詢', 'finance',
       '查詢審批中心的流程狀態，可按審批類型和狀態篩選',
       'AuditOutlined', '1.0.0', 'L1',
       '{"type":"object","properties":{"approvalType":{"type":"string","description":"審批類型","enum":["recharge","transfer","deduct","merge"]},"flowStatus":{"type":"string","description":"流程狀態","enum":["pending","approved","rejected","cancelled"]},"groupName":{"type":"string","description":"集團名稱"}}}',
       1, 1, 2, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM mcp_tool WHERE tool_key = 'query_approvals');

INSERT INTO mcp_tool (tool_key, name, category, description, icon, version, risk_level, params_json, enabled, installed, sort, deleted)
SELECT 'query_batches', '批次查詢', 'finance',
       '查詢交易批次記錄，包括充值、轉賬、扣款、合併等批次',
       'SwapOutlined', '1.0.0', 'L1',
       '{"type":"object","properties":{"groupName":{"type":"string","description":"集團名稱"},"batchType":{"type":"string","description":"批次類型","enum":["recharge","transfer","deduct","merge"]},"tradeFrom":{"type":"string","description":"交易時間起（YYYY-MM-DD）"},"tradeTo":{"type":"string","description":"交易時間止（YYYY-MM-DD）"}}}',
       1, 0, 3, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM mcp_tool WHERE tool_key = 'query_batches');
