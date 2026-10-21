-- ============================================================
-- 276_ai_lookup_glossary.sql（参考文档，实际执行体为 classpath 同名脚本）
-- lookup_glossary 工具三处登记：mcp_tool / ai_tool_policy / ai_capability
-- ============================================================

INSERT IGNORE INTO mcp_tool (tool_key, name, category, description, version, risk_level, params_json,
                             enabled, installed, installed_by, sort, source)
VALUES ('lookup_glossary', '術語口徑查詢', 'ai',
        '按關鍵詞查詢術語與統計口徑，返回術語、別名、定義、公式與示例',
        '1.0.0', 'L1',
        '{"type":"object","properties":{"keyword":{"type":"string","description":"術語、別名或口徑關鍵詞"},"domain":{"type":"string","description":"可選：限定領域 common/rdm/finance/eam/hr"},"limit":{"type":"integer","description":"返回條數，默認 5，最多 10"}},"required":["keyword"]}',
        1, 1, 'system', 91, 'builtin');

INSERT IGNORE INTO ai_tool_policy (tool_key, enabled, risk_level, require_approval, remark, updated_by)
VALUES ('lookup_glossary', 1, 'low', 0, '術語口徑按需檢索（只讀）', 'system');

INSERT IGNORE INTO ai_capability (tool_key, display_name, domain, prompt_description, use_when, avoid_when, examples_json, sort, updated_by)
VALUES ('lookup_glossary', '術語口徑查詢', 'common',
        '按關鍵詞查詢術語與統計口徑，返回術語、別名、定義、公式與示例。',
        '用戶詢問業務術語、縮寫、指標口徑，或回答前需要確認定義時。',
        '不要用它查業務數據；未收錄時如實說明，不要編造口徑。',
        '["什麼是交付項？","ROI 的口徑是什麼？"]',
        91, 'system');
