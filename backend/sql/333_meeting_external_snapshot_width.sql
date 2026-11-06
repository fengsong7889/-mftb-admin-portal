# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 333: 外部参会人顿号快照列宽 VARCHAR(500) → VARCHAR(3300)
-- ---------------------------------------------------------------------------
-- 本文件仅作参考文档，不可整脚本重放：实际执行、守卫与后置校验由
-- MeetingSchemaMigrationInitializer.doExternalSnapshotWidth() / verifyExternalSnapshotWidth()
-- 负责，版本键 meeting:schema:v1.3（已登记 db/migrations/catalog.json）。
--
-- 为什么要拓宽：biz_meeting_booking.external_attendees 存的是外部参会人姓名的顿号快照，
-- 而 biz_meeting_attendee 明细行同时存着同一批人。两处必须表达同一份名单，但旧实现的
-- 上限口径不同源：明细行按 .limit(50) 截条数，快照按 truncate(joined, 500) 截字符。
-- 2026-11-06 E2E 实测提交 100 个外部姓名：明细行 50 条、快照 85 个姓名、attendee_count=51，
-- 三个数互相矛盾；而前端「编辑回填」读的是快照字段，于是每次编辑都会把 85 个 tag 提交回去、
-- 明细行又只留 50 个，名单每改一次飘一次。
--
-- 500 字根本装不下「50 人 × 64 字 + 49 个顿号 = 3249」的合法名单，只能靠 substring 截断，
-- 而按字符数硬截会把姓名从中间切断（留下半个名字，比少一个人更难解释）。
-- 因此把列宽提到 3300，并让「上限 50 人」与「列宽」同时以 MeetingConstants 为唯一真值：
--   MAX_EXTERNAL_ATTENDEES = 50、EXTERNAL_NAME_MAX = 64、EXTERNAL_SNAPSHOT_MAX = 3300
-- 超限改为一律明确拒绝（不再静默截断），快照拼接按整名逐条累加。
--
-- 230 建表脚本同步改为 VARCHAR(3300)：新库直接建对，本迁移的守卫查到已达标就不再跑 DDL
-- （ALTER 在 InnoDB 上即使无变化也要重建表）。存量库靠本迁移收敛——只改 230 对已记过
-- v1.0/v1.2 版本的环境等于没改。

ALTER TABLE biz_meeting_booking MODIFY COLUMN external_attendees VARCHAR(3300) NULL
  COMMENT '外部参会人姓名快照，頓號分隔（無系統帳號）；列寬必須容得下上限內全量名單';

-- 后置校验（与执行侧同口径）：实查列宽必须达到 3300。
SELECT CHARACTER_MAXIMUM_LENGTH AS width
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'biz_meeting_booking'
  AND COLUMN_NAME = 'external_attendees';

-- 回滚：先确认没有超过 500 字的存量名单，否则收窄会把超出部分截断。
-- SELECT COUNT(*) FROM biz_meeting_booking
--   WHERE external_attendees IS NOT NULL AND CHAR_LENGTH(external_attendees) > 500;
-- 上面为 0 时才可执行：
-- ALTER TABLE biz_meeting_booking MODIFY COLUMN external_attendees VARCHAR(500) NULL
--   COMMENT '外部参会人姓名快照，逗号分隔（无系统账号）';
-- 回滚同时必须把 MeetingConstants.EXTERNAL_SNAPSHOT_MAX 改回 500，否则 joinExternal 仍按
-- 3300 预算拼接、写库时被窄列截断，等于回到分叉状态。
