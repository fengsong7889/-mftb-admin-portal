-- 257: RDM 任务类型字典（业务可配置）：任务类型下拉选项/图例色/聚合桶/写校验同源。
-- 参考副本：权威执行版在 classpath resources 同名文件（RdmSchemaMigrationInitializer v3.11），本文件仅作参考文档。
-- 扩展说明：不同公司研发细分不同（如 APP 拆 Android/iOS），新增类型走本表配置；
-- category 三值 design/qa/dev 决定负载统计与工时归集口径，新类型默认 dev（研发桶）。

CREATE TABLE IF NOT EXISTS rdm_task_type_config (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code        VARCHAR(32)  NOT NULL COMMENT '稳定编码: design/frontend/app/backend/qa/data，扩展如 android/ios',
    label       VARCHAR(64)  NOT NULL COMMENT '显示名（繁体）',
    color       VARCHAR(16)  NOT NULL COMMENT '图例/标签色 #RRGGBB',
    category    VARCHAR(16)  NOT NULL DEFAULT 'dev' COMMENT '聚合桶: design/qa/dev（默认 dev=研发）',
    enabled     TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序（升序）',
    company_id  BIGINT       DEFAULT NULL COMMENT '预留公司维度隔离，NULL=全局',
    remark      VARCHAR(255) DEFAULT NULL COMMENT '备注',
    created_by  VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    updated_by  VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted     TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_task_type_code (code)
) COMMENT 'RDM 任务类型字典（业务可配置）';

INSERT IGNORE INTO rdm_task_type_config (code, label, color, category, sort_order, remark) VALUES
('design',   'UI 設計',  '#EB2F96', 'design', 1, '内置种子'),
('frontend', '前端開發', '#1890FF', 'dev',    2, '内置种子'),
('app',      'APP 開發', '#FA8C16', 'dev',    3, '内置种子'),
('backend',  '後端開發', '#722ED1', 'dev',    4, '内置种子'),
('qa',       '測試',     '#13C2C2', 'qa',     5, '内置种子'),
('data',     '數據',     '#52C41A', 'dev',    6, '内置种子');
