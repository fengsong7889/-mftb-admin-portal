-- 306: 自然流量计分项 COM_06「平台會員紅包」新增计分配置列
--
-- 背景：平台会员红包计分改为「报名分 + 商家加码分」：
--       平台配置的红包出资金额由商家承担，商家报名即给报名分；
--       商家可自行额外加码，运营按「加码金额 → 分值」配置梯度，加码越多分越高。
--       配置需要随规则落库（member_bonus_config），不再只存页面草稿。
--
-- 结构：member_bonus_config TEXT，存 JSON：
--       { enrollmentScore, bonusTiers: [{ amount, score }] }
--
-- 执行方式：本文件仅作为 MySQL 参考文档。实际补列由
--          LegacyCoreContracts.organicScoreRuleContract() 的结构契约在每次启动时自愈
--          （先查 INFORMATION_SCHEMA.COLUMNS，缺失才 ADD COLUMN），禁止手动改库。
--
-- 回滚：列可保留不删（旧代码不会读取），如需清理请走发布评审，禁止直接 DROP COLUMN。
ALTER TABLE `biz_organic_score_rule`
  ADD COLUMN `member_bonus_config` TEXT DEFAULT NULL
  COMMENT '平台會員紅包計分配置 JSON（報名分 + 商家加碼梯度，僅 COM_06）';
