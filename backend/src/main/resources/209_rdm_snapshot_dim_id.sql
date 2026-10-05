-- 209: RDM 效能量日快照 dim_id 改为 NOT NULL DEFAULT 0（COMPANY 用 0 占位）
--
-- 根因：MySQL 的唯一索引**不约束 NULL**。COMPANY 维度原先 dim_id 存 NULL，
--       导致 uk_rdm_metric_day(stat_date, dim_type, dim_id) 对 COMPANY 行形同虚设，
--       快照回填重复执行就会长重复行（实测 2026-10-04 出现两行 COMPANY），
--       趋势页因此画出两个同一天数据点。
-- 口径：COMPANY 的 dim_id 固定为 0（常量 RdmConstants.COMPANY_DIM_ID），
--       写入端与趋势读取端必须共用该常量，不得各自判断。
-- 幂等：去重与 NULL 归零可重复执行；MODIFY COLUMN 重复执行无副作用。

-- 1) 同 (stat_date, dim_type, COALESCE(dim_id,0)) 只保留最大 id
--    注：本文件是项目里少见的允许 DELETE 的迁移 —— rdm_metric_snapshot 是**纯派生缓存**
--    （快照 job 可按日期整段重算），删重复行不丢任何业务事实；
--    业务表（rdm_requirement 等）仍然严禁 DELETE，不要把这里当先例。
DELETE s FROM rdm_metric_snapshot s
JOIN (SELECT stat_date, dim_type, COALESCE(dim_id, 0) AS did, MAX(id) AS keep_id
      FROM rdm_metric_snapshot
      GROUP BY stat_date, dim_type, did
      HAVING COUNT(*) > 1) d
  ON s.stat_date = d.stat_date
 AND s.dim_type = d.dim_type
 AND COALESCE(s.dim_id, 0) = d.did
WHERE s.id <> d.keep_id;

-- 2) 历史 NULL 归零，使其落到唯一索引的有效语义上
UPDATE rdm_metric_snapshot SET dim_id = 0 WHERE dim_id IS NULL;

-- 3) 列改为非空默认 0，从结构上杜绝再次写入 NULL
ALTER TABLE rdm_metric_snapshot
    MODIFY COLUMN dim_id BIGINT NOT NULL DEFAULT 0 COMMENT '維度對象ID，COMPANY 固定為 0';
