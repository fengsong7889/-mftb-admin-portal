-- 221: 系统名称全局统一为「企业门户」口径（刷新 sys_system 展示元数据）
--
-- 背景：门户卡片 / 侧边栏品牌 / 系统切换器 / 首页走前端语言包 portal.systems.<key>.name，
--       而授权中心 / 授权变更留痕 / 员工权限追溯历史上直读 sys_system.name，
--       导致同一系统在两处显示成两套名字（HR 系統 vs 人力資源系統 等）。
--       现在所有展示面统一经 src/constants/portalSystems.ts#getSystemDisplayName 取名，
--       语言包为真值；本脚本把库里的历史旧写法刷新成同一口径，使数据与展示自洽。
--
-- 真值定义处：SystemPortalSchemaInitializer#seedSystems（每次启动幂等刷新，
--             ON DUPLICATE KEY UPDATE name/name_en/description/icon/sort_order）。
-- 因此本脚本对已初始化的库是「可跳过」的——重启即自动对齐；保留脚本仅为
-- 让 DBA 在不便重启时手工核对，以及作为变更留档。
-- 锁定用例：前端 src/constants/portalSystems.test.ts + 后端
--           SystemPortalSchemaInitializerTest#seedSystemsMatchesPortalAuthoritativeNames
--
-- 回滚：按文件末尾 ROLLBACK 段恢复三行旧值（同样会被下次启动的种子刷回，
--       回滚必须先改代码种子，否则无效）。

UPDATE sys_system SET name = '人工智能管理系統', name_en = 'Artificial Intelligence',
                      description = '統一管理智能模型、使用配額與安全審計'
 WHERE code = 'ai';

UPDATE sys_system SET name = '人力資源系統', name_en = 'Human Resources',
                      description = '連接員工、組織與職位，掌握人事動態'
 WHERE code = 'hr';

UPDATE sys_system SET name = '協同辦公系統', name_en = 'Office Collaboration',
                      description = '流程申請、事項審批與員工自助，高效協作'
 WHERE code = 'oa';

-- 以下四行名称本就与门户一致，仅同步英文名与简介口径（幂等，可重复执行）
UPDATE sys_system SET name_en = 'Advertising & Recommendations',
                      description = '廣告投放、商家推廣與團購活動，助力業務增長'
 WHERE code = 'ads';
UPDATE sys_system SET name_en = 'Merchant Operations',
                      description = '統一管理商戶集團、門店資料與地圖規劃'
 WHERE code = 'merchant';
UPDATE sys_system SET name_en = 'Asset Management',
                      description = '資產、耗材、採購與庫存的全生命週期管理'
 WHERE code = 'eam';
UPDATE sys_system SET name_en = 'Access Control',
                      description = '統一配置角色、功能與數據權限，守護訪問安全'
 WHERE code = 'iam';

-- 核对：全部 13 个系统的名称应与语言包一致，查询结果不得出现旧写法
SELECT code, name, name_en, sort_order
  FROM sys_system
 WHERE deleted = 0
 ORDER BY sort_order;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK（仅在必须退回旧写法时执行；必须先回滚 Java 种子，否则下次启动被刷回）
-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE sys_system SET name = 'AI 管理系統', name_en = 'AI Hub' WHERE code = 'ai';
-- UPDATE sys_system SET name = 'HR 系統' WHERE code = 'hr';
-- UPDATE sys_system SET name = 'OA 系統', name_en = 'OA' WHERE code = 'oa';
