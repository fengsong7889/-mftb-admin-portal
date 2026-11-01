-- 321: 搜索引导域补「终端 / 时段」作用域列（方案 §18.4 第二阶段）
--
-- 背景：既有「底紋配置」页比新引导域多 terminal（终端）与 timeSlot（时段）两个作用域维度，
--       融合取优时这两维必须真实落库；按「不落库就不给字段」纪律，与前端控件同批交付。
--
-- 口径：按业务数据字典规则，系统级枚举后端存整型。
--       terminal: 1=APP 2=小程序 3=H5 4=全终端（默认 4，存量行语义为不限终端）
--       time_slot: 0=全时段 1=早餐 2=午餐 3=下午茶 4=晚餐 5=夜宵（默认 0）
--       默认值即「不限」，故存量行无需回填即可获得合理语义，列取 NOT NULL DEFAULT。
--
-- 幂等：本文件为一次性参考文档；实际幂等与后置校验由 SearchConfigSchemaInitializer 的
--       applyOnce("search:config-guidance-scope-v1.2", ...) 负责（先查 INFORMATION_SCHEMA.COLUMNS
--       再 ALTER，失败上抛不吞异常）。生产禁 DROP COLUMN。

ALTER TABLE biz_search_guidance ADD COLUMN terminal  INT NOT NULL DEFAULT 4 COMMENT '终端: 1=APP 2=小程序 3=H5 4=全终端';
ALTER TABLE biz_search_guidance ADD COLUMN time_slot INT NOT NULL DEFAULT 0 COMMENT '时段: 0=全时段 1=早餐 2=午餐 3=下午茶 4=晚餐 5=夜宵';
