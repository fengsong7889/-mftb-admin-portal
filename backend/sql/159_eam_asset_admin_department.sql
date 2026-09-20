-- 资产台账新增「管理部门」字段
ALTER TABLE biz_eam_asset ADD COLUMN admin_department VARCHAR(100) DEFAULT NULL COMMENT '管理部门' AFTER department;

-- 修复历史数据：验收入库同步的 department 实为管理部门，迁移到 admin_department
UPDATE biz_eam_asset
SET admin_department = department,
    department = NULL
WHERE batch_id IS NOT NULL
  AND department IS NOT NULL
  AND department != '';

-- 修复历史数据：从采购订单所属品牌映射购买公司（brand: 1=闪蜂, 2=mFood）
UPDATE biz_eam_asset a
INNER JOIN biz_eam_purchase_order o ON a.order_id = o.id AND o.deleted = 0
SET a.company = CASE o.brand WHEN 1 THEN '珠海闪蜂科技有限公司' WHEN 2 THEN '珠海麦峰科技有限公司' ELSE a.company END
WHERE a.batch_id IS NOT NULL
  AND (a.company IS NULL OR a.company = '')
  AND o.brand IS NOT NULL;
