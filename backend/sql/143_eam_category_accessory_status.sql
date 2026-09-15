-- =====================================================================
-- 143: EAM 分类配件表增加状态字段（配件配置独立页支持启用/停用）
--   依赖 142（biz_eam_category_accessory 建表）。
--   停用的配件不再出现在验收弹窗「带入分类配件」选项中。
-- =====================================================================

ALTER TABLE biz_eam_category_accessory
    ADD COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1=启用, 0=停用' AFTER sort;
