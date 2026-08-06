-- ============================================================
-- 15_word_library.sql — 推广词库管理表
-- ============================================================

CREATE TABLE IF NOT EXISTS prom_word_library (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    word            VARCHAR(128) NOT NULL COMMENT '词条',
    channel         VARCHAR(32)  NOT NULL COMMENT '所属频道: takeaway/supermarket/groupBuy',
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '状态: 1=啟用 2=停用',
    match_count     INT          NOT NULL DEFAULT 0 COMMENT '匹配次数',
    updated_by      VARCHAR(64)  NULL COMMENT '最后更新人',
    updated_time    DATETIME     NULL COMMENT '最后更新时间',
    remark          VARCHAR(500) NULL COMMENT '备注',
    deleted         TINYINT      DEFAULT 0 COMMENT '逻辑删除: 0=未删除 1=已删除',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_word_channel (word, channel),
    KEY idx_word_channel (channel),
    KEY idx_word_status (status),
    KEY idx_word_updated_by (updated_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广词库表';

-- 兼容已建表: 清理重复数据后建立唯一索引
DELETE w1 FROM prom_word_library w1
    JOIN prom_word_library w2 ON w1.word = w2.word AND w1.channel = w2.channel AND w1.id > w2.id
    WHERE w1.deleted = 0 AND w2.deleted = 0;

SET @sql = (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE prom_word_library ADD UNIQUE KEY uk_word_channel (word, channel)',
    'SELECT 1') FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prom_word_library' AND INDEX_NAME = 'uk_word_channel');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

