-- ============================================================
-- 269_mcp_tool_rdm.sql
-- AI 助手：產研交付（RDM）內置工具註冊（工具廣場 / AI 操作授權展示用）
-- 說明：真正的 function schema 由 Java AgentTool 提供；本表只做治理展示與啟停策略登記。
-- 冪等：INSERT IGNORE，不覆蓋管理員已改過的描述/排序。
-- ============================================================

INSERT IGNORE INTO mcp_tool
(tool_key, name, category, description, icon, version, risk_level, params_json, enabled, installed, sort, deleted, source)
VALUES
('rdm_list_projects', '項目查詢', 'rdm',
 '查詢產研交付的項目清單（籌備中/進行中/部分交付/全部交付/已關閉），可按項目經理、逾期、風險篩選',
 'ProjectOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 100, 0, 'builtin'),

('rdm_project_progress', '項目進度', 'rdm',
 '查詢單個產研項目的進度：交付項完成情況、任務完成情況、需求數、阻塞/逾期/缺陷/待辦與計劃週期',
 'FundProjectionScreenOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 101, 0, 'builtin'),

('rdm_list_iterations', '迭代查詢', 'rdm',
 '查詢產研迭代清單：可按項目、關鍵字、狀態、類型篩選，並返回需求數與任務數',
 'ScheduleOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 102, 0, 'builtin'),

('rdm_query_requirements', '需求查詢', 'rdm',
 '查詢產研需求清單：可按關鍵字、階段、項目、迭代、產品負責人、提出人、當前處理人、逾期、阻塞篩選',
 'FileTextOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 103, 0, 'builtin'),

('rdm_requirement_detail', '需求詳情', 'rdm',
 '查詢單個產研需求的詳情：狀態、人員、項目/迭代、計劃與實際時間、當前處理人、停留時長、阻塞/駁回原因、最近流轉與驗收結論',
 'ProfileOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 104, 0, 'builtin'),

('rdm_my_todos', '我的待辦', 'rdm',
 '查詢與當前用戶相關的待辦：待我審批、待我處理、待我驗收、待分配（僅有分配權者）',
 'CheckSquareOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 105, 0, 'builtin'),

('rdm_person_workload', '人員工作量', 'rdm',
 '查詢某位員工在產研需求上的工作量：負責/提交/當前處理的需求清單與數量；查他人需全量查看權',
 'TeamOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 106, 0, 'builtin'),

('rdm_stats_overview', '交付統計', 'rdm',
 '查詢產研交付全局統計：需求總量、本月提交/交付、逾期/阻塞/待分配、部門排名、產品經理排名、階段負載',
 'BarChartOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 107, 0, 'builtin'),

('rdm_risks', '風險清單', 'rdm',
 '查詢產研交付風險清單：阻塞、逾期、長期無進展、無主（待分配）、審批停滯的需求',
 'AlertOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 108, 0, 'builtin'),

('rdm_list_tasks', '任務查詢', 'rdm',
 '查詢研發任務：我的任務（可按狀態）或某個需求下的任務清單',
 'CarryOutOutlined', '1.0.0', 'L1', '{"type":"object","properties":{}}', 1, 1, 109, 0, 'builtin'),

('rdm_prepare_progress_push', '進度推送', 'rdm',
 '生成項目進度推送預覽（釘釘群或指定員工），返回待確認卡；真正發送必須由用戶在確認卡上確認',
 'SendOutlined', '1.0.0', 'L2', '{"type":"object","properties":{}}', 1, 1, 110, 0, 'builtin');
