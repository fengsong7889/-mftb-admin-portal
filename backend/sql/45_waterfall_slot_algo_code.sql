-- 45. 瀑布流坑位明细表 algo_id 改用算法编码（algo_code）
-- 背景：
--   前端坑位配置原使用算法库的数据库主键（bigint）作为算法标识，
--   但业务上用户识别算法使用的是算法编码（如 SFXH20260818000）。
--   改为存储 algo_code（varchar），与业务语义一致。
-- 影响：
--   biz_ad_waterfall_slot.algo_id 列从 bigint 改为 varchar(64)。
--   已有数据需要迁移：将 algo_id（数字主键）替换为对应的 algo_code。

-- Step 1: 修改列类型
ALTER TABLE biz_ad_waterfall_slot
MODIFY COLUMN algo_id VARCHAR(64) NOT NULL COMMENT '算法编码（关联 biz_ad_algorithm.algo_code）';

-- Step 2: 迁移已有数据（将数字 ID 转换为 algo_code）
UPDATE biz_ad_waterfall_slot s
  JOIN biz_ad_algorithm a ON CAST(s.algo_id AS UNSIGNED) = a.id
  SET s.algo_id = a.algo_code
  WHERE s.deleted = 0;

-- Step 3: 索引重建（原索引基于 bigint，改为 varchar 后需重建）
-- 先尝试删旧索引，若不存在则跳过（MySQL 不支持 DROP INDEX IF EXISTS，用存储过程容错）
DROP PROCEDURE IF EXISTS _drop_wf_slot_algo_idx;
DELIMITER $$
CREATE PROCEDURE _drop_wf_slot_algo_idx()
BEGIN
    DECLARE idx_exists INT DEFAULT 0;
    SELECT COUNT(*) INTO idx_exists
      FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'biz_ad_waterfall_slot'
       AND index_name = 'idx_ad_wf_slot_algo';
    IF idx_exists > 0 THEN
        ALTER TABLE biz_ad_waterfall_slot DROP INDEX idx_ad_wf_slot_algo;
    END IF;
END$$
DELIMITER ;
CALL _drop_wf_slot_algo_idx();
DROP PROCEDURE IF EXISTS _drop_wf_slot_algo_idx;
CREATE INDEX idx_ad_wf_slot_algo ON biz_ad_waterfall_slot (algo_id);
