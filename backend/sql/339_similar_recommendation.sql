# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- ============================================================
-- 339: 交互式相似推荐配置表（算法不可变版本 + 瀑布流场景绑定 + 允许投流集合）
-- 数据库: MySQL 8.0+
-- 说明: 配置阶段三张关系表；运行阶段决策/投放/账本表待 P3/P4 另行迁移。
--       幂等参考文档，实际幂等由 Java 迁移 applyOnce + 后置校验保证。
-- ============================================================

-- 一、算法不可变版本表：type17 参数发布后冻结，绑定只引用具体版本
CREATE TABLE IF NOT EXISTS biz_ad_algorithm_revision (
    id               BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    algorithm_id     BIGINT       NOT NULL                   COMMENT '算法主键(biz_ad_algorithm.id)',
    revision         INT          NOT NULL                   COMMENT '算法内版本序号，从1递增',
    schema_version   INT          NOT NULL DEFAULT 1         COMMENT '参数协议版本',
    params_snapshot  JSON         NOT NULL                   COMMENT '不可变参数快照(已通过schema校验)',
    content_hash     CHAR(64)     NOT NULL                   COMMENT '规范化快照摘要(SHA-256)',
    created_by       VARCHAR(64)                             COMMENT '发布人',
    created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '发布时间',
    UNIQUE KEY uk_algo_revision (algorithm_id, revision),
    UNIQUE KEY uk_algo_revision_ref (algorithm_id, id),
    KEY idx_revision_algorithm (algorithm_id),
    CONSTRAINT fk_revision_algorithm FOREIGN KEY (algorithm_id)
        REFERENCES biz_ad_algorithm (id) ON DELETE RESTRICT,
    CONSTRAINT ck_revision_no CHECK (revision > 0),
    CONSTRAINT ck_revision_schema CHECK (schema_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='算法不可变版本表(交互式相似推荐)';

-- 二、瀑布流场景绑定表：一个瀑布流一个场景唯一一行，停用不删行
CREATE TABLE IF NOT EXISTS biz_ad_waterfall_recommendation (
    id                    BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    waterfall_id          BIGINT       NOT NULL                   COMMENT '瀑布流策略主键(biz_ad_waterfall.id)',
    scene_code            TINYINT      NOT NULL DEFAULT 1         COMMENT '场景: 1=详情返回瀑布流 2/3=预留首期不可启用',
    algorithm_id          BIGINT       NOT NULL                   COMMENT '相似推荐算法主键(type17)',
    algorithm_revision_id BIGINT       NOT NULL                   COMMENT '引用的不可变版本主键',
    enabled               TINYINT      NOT NULL DEFAULT 0         COMMENT '启用: 0=关闭 1=启用',
    candidate_scope       TINYINT      NOT NULL DEFAULT 1         COMMENT '候选范围: 1=全部合格商家 2=仅有效投流商家',
    business_type         TINYINT      NOT NULL                   COMMENT '业务类型: 1=外卖到家 2=团购到店(服务端校验)',
    biz_channel           TINYINT      NOT NULL                   COMMENT '业务频道: 1=美食外卖 2=超市百货 3=团购到店(服务端校验)',
    version               BIGINT       NOT NULL DEFAULT 0         COMMENT '乐观锁版本',
    updated_by            VARCHAR(64)                             COMMENT '最后更新人',
    created_at            DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at            DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_waterfall_scene (waterfall_id, scene_code),
    KEY idx_rec_revision (algorithm_revision_id),
    KEY idx_rec_algorithm (algorithm_id, enabled),
    CONSTRAINT fk_rec_waterfall FOREIGN KEY (waterfall_id)
        REFERENCES biz_ad_waterfall (id) ON DELETE RESTRICT,
    CONSTRAINT fk_rec_revision FOREIGN KEY (algorithm_revision_id, algorithm_id)
        REFERENCES biz_ad_algorithm_revision (algorithm_id, id) ON DELETE RESTRICT,
    CONSTRAINT ck_rec_scene CHECK (scene_code IN (1, 2, 3)),
    CONSTRAINT ck_rec_enabled CHECK (enabled IN (0, 1)),
    CONSTRAINT ck_rec_scope CHECK (candidate_scope IN (1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='瀑布流相似推荐场景绑定表';

-- 三、允许投流算法集合：candidate_scope=2 时必须非空，元素为 type15 真实主键
CREATE TABLE IF NOT EXISTS biz_ad_waterfall_recommendation_traffic (
    binding_id           BIGINT   NOT NULL                   COMMENT '场景绑定主键',
    traffic_algorithm_id BIGINT   NOT NULL                   COMMENT '允许的投流算法主键(type15)',
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (binding_id, traffic_algorithm_id),
    KEY idx_rec_traffic_algo (traffic_algorithm_id),
    CONSTRAINT fk_rec_traffic_binding FOREIGN KEY (binding_id)
        REFERENCES biz_ad_waterfall_recommendation (id) ON DELETE CASCADE,
    CONSTRAINT fk_rec_traffic_algo FOREIGN KEY (traffic_algorithm_id)
        REFERENCES biz_ad_algorithm (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='相似推荐允许投流算法集合表';
