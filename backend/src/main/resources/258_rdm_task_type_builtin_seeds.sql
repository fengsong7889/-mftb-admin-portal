-- 258: RDM 任务类型字典内置扩充（14 类）+ 按岗位族重排既有六类排序。
-- 背景：APP 只有一档不够用，不同公司研发细分不同（Android / iOS / 鸿蒙 / 小程序 / H5）；
--       参照市面工程师岗位（mobile / full-stack / DevOps / SRE / security / ML / SDET / UX）补齐内置范本。
-- 口径：category 三值 design/qa/dev 决定负载统计与工时归集；移动端/平台/全栈一律 dev 桶，
--       自动化与性能测试归 qa 桶，交互与视觉归 design 桶。
-- 策略：新增行「移动端 + 运维 + 算法」默认启用，其余默认停用（按需一键启用，避免下拉过长）；
--       既有六类只重排 sort_order，不改 code/label/color，存量任务引用零影响。
-- 幂等：INSERT IGNORE + 条件 UPDATE，可安全重放。

INSERT IGNORE INTO rdm_task_type_config (code, label, color, category, enabled, sort_order, remark) VALUES
-- 移動端族（APP 細分）
('android',        'Android 開發',      '#3DDC84', 'dev',    1, 23, '內建範本'),
('ios',            'iOS 開發',          '#597EF7', 'dev',    1, 24, '內建範本'),
('harmony',        '鴻蒙開發',          '#F5222D', 'dev',    1, 25, '內建範本'),
('mini_program',   '小程序開發',        '#07C160', 'dev',    1, 22, '內建範本'),
('h5',             'H5 頁面開發',       '#40A9FF', 'dev',    1, 21, '內建範本'),
-- 服務端與平台族
('fullstack',      '全棧開發',          '#B37FEB', 'dev',    0, 31, '內建範本（預設停用）'),
('ai_algo',        '算法 / AI 開發',    '#9254DE', 'dev',    1, 32, '內建範本'),
('devops',         '運維 / DevOps',     '#2F54EB', 'dev',    1, 40, '內建範本'),
('sre',            '穩定性 / SRE',      '#10239E', 'dev',    0, 41, '內建範本（預設停用）'),
('security',       '安全開發',          '#820014', 'dev',    0, 42, '內建範本（預設停用）'),
-- 質量族
('automation_qa',  '自動化測試',        '#36CFC9', 'qa',     0, 51, '內建範本（預設停用）'),
('performance_qa', '性能測試',          '#13A8A8', 'qa',     0, 52, '內建範本（預設停用）'),
-- 設計族
('ux',             '交互 / UX 設計',    '#F759AB', 'design', 0, 11, '內建範本（預設停用）'),
('visual',         '視覺 / 品牌設計',   '#C41D7F', 'design', 0, 12, '內建範本（預設停用）');

-- 既有六类按岗位族重排（只动 sort_order；管理员若已自定义过顺序，本语句为一次性种子重排）
UPDATE rdm_task_type_config SET sort_order = 10 WHERE code = 'design'   AND deleted = 0;
UPDATE rdm_task_type_config SET sort_order = 20 WHERE code = 'frontend' AND deleted = 0;
UPDATE rdm_task_type_config SET sort_order = 26 WHERE code = 'app'      AND deleted = 0;
UPDATE rdm_task_type_config SET sort_order = 30 WHERE code = 'backend'  AND deleted = 0;
UPDATE rdm_task_type_config SET sort_order = 33 WHERE code = 'data'     AND deleted = 0;
UPDATE rdm_task_type_config SET sort_order = 50 WHERE code = 'qa'       AND deleted = 0;
