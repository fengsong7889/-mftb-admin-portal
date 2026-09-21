-- 181: 报废记录表新增所属品牌字段
ALTER TABLE biz_eam_scrap ADD COLUMN company_brand INT NULL COMMENT '所属品牌/公司品牌ID（快照）' AFTER brand;
