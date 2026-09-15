-- 采购订单新增「所属品牌」字段
-- brand: 1=闪蜂, 2=mFood
ALTER TABLE biz_eam_purchase_order
  ADD COLUMN brand TINYINT NULL COMMENT '所属品牌：1=闪蜂, 2=mFood' AFTER department;
