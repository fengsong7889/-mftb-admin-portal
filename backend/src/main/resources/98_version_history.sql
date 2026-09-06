-- ============================================================
-- MFTB 搜广推系统 - 版本发布历史记录表
-- 记录每次迭代更新的版本编号、前后端变更内容，支持查看与追溯
-- ============================================================

CREATE TABLE IF NOT EXISTS sys_version_history (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    version_no       VARCHAR(32)  NOT NULL COMMENT '版本号 (Semantic Versioning, 如 1.0.0)',
    release_date     DATE         NOT NULL COMMENT '发布日期',
    release_type     VARCHAR(16)  NOT NULL DEFAULT 'patch' COMMENT '发布类型: major/minor/patch',
    summary          VARCHAR(500) NOT NULL DEFAULT '' COMMENT '版本概要说明',
    frontend_changes TEXT         NULL COMMENT '前端更新内容 (每行一条)',
    backend_changes  TEXT         NULL COMMENT '后端更新内容 (每行一条)',
    database_changes TEXT         NULL COMMENT '数据库变更内容 (每行一条)',
    status           TINYINT      NOT NULL DEFAULT 1 COMMENT '状态: 1=已发布 2=草稿',
    created_by       VARCHAR(64)  NULL COMMENT '创建人',
    updated_by       VARCHAR(64)  NULL COMMENT '最后更新人',
    created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_version_no (version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='版本发布历史记录表';

-- 写入当前版本作为第一条记录
INSERT IGNORE INTO sys_version_history (version_no, release_date, release_type, summary, frontend_changes, backend_changes, database_changes, status, created_by)
VALUES (
    '1.0.0',
    CURDATE(),
    'major',
    '系统初始版本发布，包含完整的搜广推管理后台功能',
    '完整的搜广推管理后台前端界面，包含财务管理、搜索管理、推广工具、商户管理、赠送管理、报表分析、团购管理、系统配置、AI智能中心等模块',
    '完整的搜广推管理后台后端服务，包含权限管理、财务管理、广告推广、自然流量评分、AI智能中心、审批流程等模块',
    '全量数据库脚本 01~97，涵盖系统表、权限表、业务表、广告推广表、AI中心表等',
    1,
    '系統'
);
