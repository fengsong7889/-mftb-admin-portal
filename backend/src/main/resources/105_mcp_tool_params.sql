-- ============================================================
-- 105_mcp_tool_params.sql
-- 內置工具 Schema 升級：query_batches 增加金額過濾參數（amountMin/amountMax）
-- 支撐 AI 助手「哪些集團充值了 10 萬推廣金」類查詢（對應 FinBatchQuery 金额条件）
-- 冪等腳本，可重複執行
-- ============================================================

UPDATE mcp_tool
SET params_json = '{"type":"object","properties":{"groupName":{"type":"string","description":"集團名稱"},"batchType":{"type":"string","description":"批次類型","enum":["recharge","transfer","deduct","merge"]},"tradeFrom":{"type":"string","description":"交易時間起（YYYY-MM-DD）"},"tradeTo":{"type":"string","description":"交易時間止（YYYY-MM-DD）"},"amountMin":{"type":"number","description":"充值金額下限（虛擬推廣金，元），如 100000"},"amountMax":{"type":"number","description":"充值金額上限（虛擬推廣金，元）"}}}'
WHERE tool_key = 'query_batches';
