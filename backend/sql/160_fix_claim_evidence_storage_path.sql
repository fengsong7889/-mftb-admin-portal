-- 修复签署页提交时 signature image 过长导致 storage_path 字段溢出
-- 原始 VARCHAR(500) 无法容纳 base64 编码的 PNG 签名图片；
-- 手机高分屏（dpr=3）全屏签名导出的 base64 PNG 可超 64KB，TEXT 仍不够，故用 MEDIUMTEXT

ALTER TABLE biz_eam_claim_evidence
    MODIFY COLUMN storage_path MEDIUMTEXT NOT NULL COMMENT '存储路径或 Data URL (base64)';
