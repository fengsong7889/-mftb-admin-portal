-- 174: 资产台账新增配件清单字段
-- 存储格式：JSON 数组 [{name, qty}]，与入库批次明细 accessories 一致

ALTER TABLE biz_eam_asset
  ADD COLUMN accessories TEXT DEFAULT NULL COMMENT '配件清单 JSON 数组 [{name,qty}]';

-- 从入库批次明细回填已有资产的配件清单
-- 关联路径：biz_eam_asset.batch_id → biz_eam_inbound_batch.id → biz_eam_inbound_batch_item.batch_id
-- 同一批次有多条明细时，取 sort_order 最小的那条（通常单明细场景，多明细需人工核对）
UPDATE biz_eam_asset a
INNER JOIN biz_eam_inbound_batch b ON a.batch_id = b.id
INNER JOIN biz_eam_inbound_batch_item bi ON b.id = bi.batch_id
  AND bi.id = (
    SELECT bi2.id FROM biz_eam_inbound_batch_item bi2
    WHERE bi2.batch_id = b.id
      AND bi2.accessories IS NOT NULL AND bi2.accessories != '' AND bi2.accessories != '[]'
    ORDER BY bi2.sort_order ASC, bi2.id ASC
    LIMIT 1
  )
SET a.accessories = bi.accessories
WHERE a.accessories IS NULL AND a.batch_id IS NOT NULL AND a.deleted = 0;
