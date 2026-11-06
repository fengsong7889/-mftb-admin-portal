# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 332: 数组型 i18n key 从 sys_translation 退库（逻辑删除）
-- ---------------------------------------------------------------------------
-- 本文件仅作参考文档：实际执行、幂等与后置校验由
-- TranslationDataInitializer.doRetireArrayKeys() / verifyArrayKeysRetired() 负责，
-- 版本键 translation:array-keys-cleanup-v1（已登记 db/migrations/catalog.json）。
--
-- 背景：sys_translation 是「field_key → 各语言字符串」的扁平结构，结构上装不下数组。
-- 但镜像同步器 flattenMap() 对 List 走了 value.toString()，把语言包里的数组型文案
-- 整串灌成了一条记录，2026-11-06 实测 8 个 key 全中招：
--   meeting.calendarWeekdays  "[周日, 周一, 周二, 周三, 周四, 周五, 周六]"
--   home.weekdays / adSales.weekdayFull / adSales.weekdayShort  同形
--   portal.quotes             励志语清单被压成一串
--   home.todos / home.notifList / home.announceList  对象数组被压成 "[object Object],…"
-- 后果分两档：
--   zh-TW/en/zh-CN：前端静态包里同名 key 是数组，addResourceBundle(overwrite=false)
--     不会被数据库串盖掉，但 zh-CN 的静态包当时也被生成器压成了字符串（见 332 配套
--     scripts/gen-zh-cn-locale.mjs 修复），两层同时坏 → 「我的会议」日历视图
--     weekdays.map() 直接把整页打成错误边界。
--   ja/ko/ru：静态包里没有这些 key，取值完全依赖数据库注入，等于「该语言有值」，
--     i18next 不再 fallback 到英文数组；机翻还在括号串上跑了一轮，日语库里存的是
--     "【日・月・火・水・木・金・土】"。
--
-- 因此本步把这些行逻辑删除：数组型文案的真源只能是前端静态语言包，数据库不参与。
-- 只动 source='sync'（镜像灌进去的）；source='manual' 是业务方手工登记的译名，一律不碰。
-- 逻辑删除而非物理删除，与本表其余下架操作口径一致，保留对账与回滚能力。
--
-- 待清 key 不写死在本文件里：执行侧从 classpath:i18n/zh-TW.json 现算「值为数组」的
-- 点分隔 key，将来新增或删除数组型文案会自动跟上，不会留下「代码名单比真源旧」的二次腐化。
-- 下面只是当前快照，便于人工核对与交付对账。

UPDATE sys_translation SET deleted = 1, updated_by = 'system'
WHERE source = 'sync' AND deleted = 0
  AND field_key IN (
    'portal.quotes',
    'home.todos',
    'home.notifList',
    'home.announceList',
    'home.weekdays',
    'adSales.weekdayFull',
    'adSales.weekdayShort',
    'meeting.calendarWeekdays'
  );

-- 后置校验（与执行侧同口径）：以上 key 不得再有未删除的 sync 行。
SELECT COUNT(*) AS residual FROM sys_translation
WHERE source = 'sync' AND deleted = 0
  AND field_key IN ('portal.quotes', 'home.todos', 'home.notifList', 'home.announceList',
                    'home.weekdays', 'adSales.weekdayFull', 'adSales.weekdayShort',
                    'meeting.calendarWeekdays');

-- 回滚：把 deleted 置回 0 即可恢复原行（值本身未被改写）。但回滚前必须同时回退
-- flattenMap 的数组跳过逻辑，否则下次启动同步又会把这些行当已有记录继续用。
-- UPDATE sys_translation SET deleted = 0 WHERE source = 'sync' AND deleted = 1
--   AND updated_by = 'system' AND field_key IN (…上面 8 个 key…);
