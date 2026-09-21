-- 182: 资产报废记录表新增 scrap_no 列（报废编号）
ALTER TABLE biz_eam_scrap ADD COLUMN scrap_no VARCHAR(64) NULL COMMENT '报废编号' AFTER asset_id;
