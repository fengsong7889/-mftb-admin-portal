-- ============================================================
-- 104_mcp_tool_external.sql
-- 外部服務種子：MCP Server 接入規劃目錄（單菜單「外部服務」分區）
-- 本期僅入庫展示與安裝狀態管理，執行鏈路（MCP Client 連接）未接入：
-- listInstalled 僅下發 source='builtin'，外部服務不會出現在 AI 助手工具列表
-- 冪等腳本，可重複執行
-- ============================================================

-- 1. 企業微信機器人（官方 API，合規推薦）
INSERT INTO mcp_tool (tool_key, name, category, description, icon, version, risk_level, params_json, enabled, installed, source, transport, sort, deleted)
SELECT 'wecom_bot', '企業微信機器人', 'notify',
       '通過企業微信官方 API 向指定成員或群聊發送消息（合規穩定，推薦），適用於將查詢結果推送給指定同事',
       'MessageOutlined', '1.0.0', 'L3',
       '{"type":"object","properties":{"target":{"type":"string","description":"接收人（成員賬號或群名稱）"},"content":{"type":"string","description":"要發送的消息內容"}},"required":["target","content"]}',
       1, 0, 'external', 'remote-http', 101, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM mcp_tool WHERE tool_key = 'wecom_bot');

-- 2. 郵件發送（SMTP）
INSERT INTO mcp_tool (tool_key, name, category, description, icon, version, risk_level, params_json, enabled, installed, source, transport, sort, deleted)
SELECT 'email_sender', '郵件發送', 'notify',
       '通過 SMTP 向指定郵箱發送報表或查詢結果，適用於正式報表歸檔與外部溝通',
       'MailOutlined', '1.0.0', 'L3',
       '{"type":"object","properties":{"to":{"type":"string","description":"收件人郵箱"},"subject":{"type":"string","description":"郵件主題"},"content":{"type":"string","description":"郵件正文"}},"required":["to","subject","content"]}',
       1, 0, 'external', 'remote-http', 102, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM mcp_tool WHERE tool_key = 'email_sender');

-- 3. 微信桌面助手（個人版無官方 API，GUI 自動化，賬號限制風險）
INSERT INTO mcp_tool (tool_key, name, category, description, icon, version, risk_level, params_json, enabled, installed, source, transport, sort, deleted)
SELECT 'wechat_desktop', '微信桌面助手', 'notify',
       '基於桌面 GUI 自動化操作微信客戶端發送消息（個人版無官方 API，存在賬號限制風險，需審慎評估；建議優先使用企業微信機器人）',
       'WechatOutlined', '1.0.0', 'L3',
       '{"type":"object","properties":{"contact":{"type":"string","description":"微信聯繫人備註名"},"content":{"type":"string","description":"要發送的消息內容"}},"required":["contact","content"]}',
       1, 0, 'external', 'local-stdio', 103, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM mcp_tool WHERE tool_key = 'wechat_desktop');
