-- 205: RDM 附件/截图改为可存 Base64 Data URL（与 EAM 验收入库照片口径一致）
--      一次性参考文档；实际执行与幂等由 RdmSchemaMigrationInitializer 负责。
--      版本键: rdm:schema:v1.1。MODIFY COLUMN 可重复执行（结果一致），无破坏性语句。
--      动机：上传接口限制单文件 5MB，Base64 后约 6.8MB，VARCHAR(500)/TEXT(64KB) 均不足，
--      故扩到 MEDIUMTEXT(16MB)。列语义仍是「图片地址」，只是允许内联 data URL。

ALTER TABLE rdm_requirement_target
    MODIFY COLUMN screenshot_path MEDIUMTEXT DEFAULT NULL COMMENT '現狀截圖（存储路径或 Base64 Data URL）';

ALTER TABLE rdm_attachment
    MODIFY COLUMN storage_path MEDIUMTEXT DEFAULT NULL COMMENT '附件内容（存储路径或 Base64 Data URL）';
