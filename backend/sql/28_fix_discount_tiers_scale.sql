-- =====================================================================
-- 28_fix_discount_tiers_scale.sql
-- 修复梯度折扣 discount_tiers 历史错误记法（前端曾按「折 × 100」落库）
--
-- 背景：
--   后端计价/下单统一使用「百分比记法」：9折 = 90、95折 = 95（计价时 total * discount / 100），
--   但定价配置页历史版本保存时误将「折」×100（9折 存成 900），导致：
--     1) 广告购买页横幅/当前所选显示「90折」等错误文案；
--     2) 下单计价按 900% 计算，金额放大 10 倍。
--   本脚本将 discount > 100 的档位值 ÷10，恢复为百分比记法（900 → 90）。
--
-- 说明：
--   - 仅处理 discount > 100 的元素，百分比记法的正常数据（≤100）不受影响；
--   - 聚合后档位顺序不保证，后端/前端解析时均按 minDays/minSlots 升序排序，无功能影响；
--   - 适用于 MySQL 8.0+（JSON_TABLE / JSON_ARRAYAGG）。
-- =====================================================================

-- 1) 盘活复苏计价主表（多天梯度折扣）
UPDATE biz_ad_pricing_revive p
JOIN (
  SELECT t.id AS tid,
         JSON_ARRAYAGG(
           JSON_OBJECT(
             'minDays', jt.minDays,
             'discount', IF(jt.discount > 100, jt.discount / 10, jt.discount)
           )
         ) AS fixed_tiers
  FROM biz_ad_pricing_revive t
  JOIN JSON_TABLE(
    t.discount_tiers, '$[*]' COLUMNS (
      minDays  INT           PATH '$.minDays',
      discount DECIMAL(10,2) PATH '$.discount'
    )
  ) jt
  WHERE t.deleted = 0
    AND t.discount_tiers IS NOT NULL
  GROUP BY t.id
  HAVING MAX(jt.discount) > 100
) x ON x.tid = p.id
SET p.discount_tiers = x.fixed_tiers;

-- 2) 无敌星星计价主表（多时段梯度折扣）
UPDATE biz_ad_pricing_star p
JOIN (
  SELECT t.id AS tid,
         JSON_ARRAYAGG(
           JSON_OBJECT(
             'minSlots', jt.minSlots,
             'discount', IF(jt.discount > 100, jt.discount / 10, jt.discount)
           )
         ) AS fixed_tiers
  FROM biz_ad_pricing_star t
  JOIN JSON_TABLE(
    t.discount_tiers, '$[*]' COLUMNS (
      minSlots INT           PATH '$.minSlots',
      discount DECIMAL(10,2) PATH '$.discount'
    )
  ) jt
  WHERE t.deleted = 0
    AND t.discount_tiers IS NOT NULL
  GROUP BY t.id
  HAVING MAX(jt.discount) > 100
) x ON x.tid = p.id
SET p.discount_tiers = x.fixed_tiers;
