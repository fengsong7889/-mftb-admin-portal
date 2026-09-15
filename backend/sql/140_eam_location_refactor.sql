-- 仓库维护重构：从「仓库/楼层/房间」层级结构调整为「省-市-区-详细地址」行政区域维度
-- 1. 新增 province, city, district 字段
-- 2. type 字段保留但不再使用（兼容旧数据，后续可清理）

ALTER TABLE biz_eam_location
  ADD COLUMN province VARCHAR(64) DEFAULT '' COMMENT '省份（如：广东省）' AFTER type,
  ADD COLUMN city VARCHAR(64) DEFAULT '' COMMENT '城市（如：珠海市）' AFTER province,
  ADD COLUMN district VARCHAR(64) DEFAULT '' COMMENT '区县（如：香洲区）' AFTER city;
