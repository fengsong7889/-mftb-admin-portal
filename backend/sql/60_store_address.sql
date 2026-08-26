-- 门店表新增地址字段
ALTER TABLE biz_store ADD COLUMN address VARCHAR(256) NULL COMMENT '门店地址' AFTER region;

-- 为存量门店填充澳门真实地址（按门店名称匹配）
UPDATE biz_store SET address = '澳門新馬路128號' WHERE store_name LIKE '%新馬路%' AND address IS NULL;
UPDATE biz_store SET address = '澳門氹仔官也街56號' WHERE store_name LIKE '%氹仔%' AND store_name LIKE '%豪華%' AND address IS NULL;
UPDATE biz_store SET address = '珠海拱北迎賓廣場12號' WHERE store_name LIKE '%拱北%' AND address IS NULL;
UPDATE biz_store SET address = '珠海香洲鳳凰路88號' WHERE store_name LIKE '%香洲%' AND address IS NULL;
UPDATE biz_store SET address = '澳門氹仔官也街美食廣場2樓' WHERE store_name LIKE '%官也街%' AND store_name LIKE '%美食%' AND address IS NULL;
UPDATE biz_store SET address = '澳門議事亭前地18號' WHERE store_name LIKE '%旗艦店%' AND address IS NULL;
UPDATE biz_store SET address = '澳門黑沙環馬路88號' WHERE store_name LIKE '%黑沙環%' AND address IS NULL;
UPDATE biz_store SET address = '澳門提督馬路66號' WHERE store_name LIKE '%提督%' AND address IS NULL;
UPDATE biz_store SET address = '澳門高美士街23號' WHERE store_name LIKE '%高美士%' AND address IS NULL;
UPDATE biz_store SET address = '澳門路氹城金光大道' WHERE store_name LIKE '%路氹%' AND address IS NULL;
