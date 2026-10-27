-- 301: 接口文档出参结构（只读派生）与接口名称来源。
-- 实际迁移由 DocApiCatalogSchema.addSchemaColumns 幂等执行；本文件仅作参考文档。
ALTER TABLE doc_api_catalog
    ADD COLUMN response_fields MEDIUMTEXT NULL COMMENT '出參字段表 JSON（路徑/類型/必填/說明）',
    ADD COLUMN api_name_source VARCHAR(16) NULL COMMENT '接口名称来源：operation/auto/manual';
