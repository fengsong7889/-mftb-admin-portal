-- ----------------------------
-- AI 模型表增加部署类型字段
-- 用途：「數據不出域」策略開啟後，僅可選擇私有化（本地化）部署的模型
-- deploy_type: cloud=公有云 private=私有化部署
-- ----------------------------
ALTER TABLE `ai_model`
    ADD COLUMN `deploy_type` VARCHAR(20) NOT NULL DEFAULT 'cloud' COMMENT '部署类型：cloud=公有云 private=私有化部署' AFTER `type`;

-- 存量模型默认为公有云；如有私有化模型由运维在模型编辑页手动标记
