-- 176: 领用记录新增配件清单字段（领用时的配件快照）
ALTER TABLE biz_eam_claim ADD COLUMN accessories TEXT NULL COMMENT '领用配件快照 JSON（领用时从资产复制，支持删减）';
