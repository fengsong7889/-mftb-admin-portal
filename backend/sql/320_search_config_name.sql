-- 320: 搜索运营系统 · 配置管理域补「名称」权威字段（方案 §11.1 定版）
--
-- 背景：319 建表时按「身份 = 编号 + 业务字段」设计，未提供人类可读名称列；
--       实测确认前端表单可填「名稱」但后端不消费，输入静默丢失，构成 UI 假象。
--       经产品定版：名称属于权威业务字段，必须真实落库、可检索、可展示。
--
-- 口径：干预域的 target_name 语义是「被干预对象（门店/集团）名称」，与表单里的「规则名稱」
--       不是同一个东西，故干预域另补 rule_name；五表各自按名词前缀命名，与既有 *_no 成套。
--
-- 幂等：本文件为一次性参考文档；实际幂等与后置校验由
--       SearchConfigSchemaInitializer 的 applyOnce("search:config-name-v1.1", ...) 负责
--       （先查 INFORMATION_SCHEMA.COLUMNS，缺列才 ALTER，严禁吞异常）。
-- 约束：列可为 NULL —— 存量行无法回溯出有意义的名称；由服务层在新增/更新时强制非空且 ≤60 字。
--       生产禁 DROP COLUMN。

ALTER TABLE biz_search_guidance  ADD COLUMN config_name    VARCHAR(60) DEFAULT NULL COMMENT '配置名称(人类可读标识,服务层强制必填)';
ALTER TABLE biz_search_lexicon   ADD COLUMN entry_name      VARCHAR(60) DEFAULT NULL COMMENT '词条名称(人类可读标识,服务层强制必填)';
ALTER TABLE biz_search_scenario  ADD COLUMN scenario_name   VARCHAR(60) DEFAULT NULL COMMENT '策略名称(人类可读标识,服务层强制必填)';
ALTER TABLE biz_search_intervention ADD COLUMN rule_name     VARCHAR(60) DEFAULT NULL COMMENT '干预规则名称(人类可读标识,与target_name语义不同)';
ALTER TABLE biz_search_release   ADD COLUMN release_name    VARCHAR(60) DEFAULT NULL COMMENT '版本名称(人类可读标识,服务层强制必填)';
