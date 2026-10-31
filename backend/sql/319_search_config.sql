-- 319: 搜索运营系统重构 · 配置管理域建表（方案 §11.1；实际幂等执行由 SearchConfigSchemaInitializer 负责，本文件为一次性参考文档）
-- 方言：MySQL 8.x。金额/乘数用 DECIMAL，禁止 float；逻辑删除 deleted TINYINT；utf8mb4。
-- 说明：本批仅落「配置管理域」5 张表（引导词/词库/场景策略/商家干预/配置发布）。
--       真实 ES 索引、投流交付账本、财务关联表属 B1/B3，依赖 D0 资料与另行授权，本批不建。

-- 1) 搜索引导配置：底纹词/自然热搜/推广搜索/候选热词
CREATE TABLE IF NOT EXISTS biz_search_guidance (
  id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键',
  config_no       VARCHAR(32)   NOT NULL                   COMMENT '配置编号',
  word_type       INT           NOT NULL                   COMMENT '类型: 1=底纹词 2=自然热搜 3=推广搜索 4=候选热词',
  display_text    VARCHAR(64)   NOT NULL                   COMMENT '展示词',
  target_query    VARCHAR(64)   NOT NULL                   COMMENT '点击后提交的搜索词(不支持任意外链)',
  brand           VARCHAR(32)   DEFAULT NULL               COMMENT 'APP 所属品牌: flashBee/mFood',
  surface         INT           NOT NULL DEFAULT 1         COMMENT '场景: 1=首页 2=频道 3=店内',
  biz_channel     INT           DEFAULT NULL               COMMENT '业务频道: 1=美食外卖 2=超市百货 3=团购到店',
  region_code     VARCHAR(32)   DEFAULT NULL               COMMENT '区域编码(空=全城)',
  priority        INT           NOT NULL DEFAULT 1         COMMENT '展示次序(1-20)',
  source          INT           NOT NULL DEFAULT 1         COMMENT '来源: 1=人工策划 2=去重搜索趋势 3=商业计划',
  start_date      DATE          DEFAULT NULL               COMMENT '生效开始',
  end_date        DATE          DEFAULT NULL               COMMENT '生效结束',
  approval_status INT           NOT NULL DEFAULT 1         COMMENT '审批: 1=未审批 2=已审批 3=驳回',
  status          INT           NOT NULL DEFAULT 1         COMMENT '服务状态: 1=启用 2=停用',
  remark          VARCHAR(255)  DEFAULT NULL               COMMENT '备注',
  created_by      VARCHAR(64)   DEFAULT NULL,
  updated_by      VARCHAR(64)   DEFAULT NULL,
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted         TINYINT       DEFAULT 0,
  UNIQUE KEY uk_search_guidance_no (config_no),
  KEY idx_search_guidance_type (word_type, status),
  KEY idx_search_guidance_scope (brand, surface, biz_channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索引导配置';

-- 2) 搜索词库：业务词/实体别名/有向同义词/纠错词/禁限词
CREATE TABLE IF NOT EXISTS biz_search_lexicon (
  id              BIGINT        PRIMARY KEY AUTO_INCREMENT,
  entry_no        VARCHAR(32)   NOT NULL                   COMMENT '词条编号',
  word_type       INT           NOT NULL                   COMMENT '类型: 1=业务词 2=实体别名 3=有向同义 4=纠错 5=禁限',
  source_term     VARCHAR(64)   NOT NULL                   COMMENT '原词/别名',
  target_term     VARCHAR(64)   NOT NULL                   COMMENT '标准词/实体',
  entity_id       BIGINT        DEFAULT NULL               COMMENT '归属实体ID(别名/精确准入用)',
  entity_type     INT           DEFAULT NULL               COMMENT '实体类型: 1=门店 2=集团 3=品牌',
  category_id     VARCHAR(32)   DEFAULT NULL               COMMENT '适用类目',
  brand           VARCHAR(32)   DEFAULT NULL,
  evidence        VARCHAR(255)  DEFAULT NULL               COMMENT '来源依据',
  status          INT           NOT NULL DEFAULT 1         COMMENT '1=启用 2=停用',
  created_by      VARCHAR(64)   DEFAULT NULL,
  updated_by      VARCHAR(64)   DEFAULT NULL,
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted         TINYINT       DEFAULT 0,
  UNIQUE KEY uk_search_lexicon_no (entry_no),
  KEY idx_search_lexicon_term (source_term, word_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索词库';

-- 3) 场景策略：五场景字段权重/候选窗口/广告上限
CREATE TABLE IF NOT EXISTS biz_search_scenario (
  id                BIGINT      PRIMARY KEY AUTO_INCREMENT,
  scenario_no       VARCHAR(32) NOT NULL,
  surface           INT         NOT NULL                   COMMENT '1=首页 2=频道 3=店内',
  biz_channel       INT         DEFAULT NULL,
  object_type       INT         DEFAULT NULL               COMMENT '对象类型: 1=商家 2=商品 3=套餐',
  weight_relevance  INT         NOT NULL DEFAULT 65        COMMENT '相关性 R(%)',
  weight_quality    INT         NOT NULL DEFAULT 15        COMMENT '品质 Q(%)',
  weight_distance   INT         NOT NULL DEFAULT 15        COMMENT '距离 D(%)',
  weight_heat       INT         NOT NULL DEFAULT 5         COMMENT '热度 H(%)',
  candidate_window  INT         NOT NULL DEFAULT 200       COMMENT '候选窗口上限',
  ad_limit_per_page INT         NOT NULL DEFAULT 0         COMMENT '首屏广告上限(店内=0)',
  filter_rule       TEXT        DEFAULT NULL               COMMENT '过滤/排序规则(JSON)',
  status            INT         NOT NULL DEFAULT 1,
  created_by        VARCHAR(64) DEFAULT NULL,
  updated_by        VARCHAR(64) DEFAULT NULL,
  created_at        DATETIME    DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted           TINYINT     DEFAULT 0,
  UNIQUE KEY uk_search_scenario_no (scenario_no),
  KEY idx_search_scenario_scope (surface, biz_channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索场景策略';

-- 4) 商家干预：泛词降权/精确准入/扶持/打散（有原因+有效期+审批）
CREATE TABLE IF NOT EXISTS biz_search_intervention (
  id              BIGINT        PRIMARY KEY AUTO_INCREMENT,
  rule_no         VARCHAR(32)   NOT NULL,
  target_type     INT           NOT NULL                   COMMENT '1=集团 2=门店',
  target_id       VARCHAR(64)   NOT NULL                   COMMENT '目标集团/门店编码',
  target_name     VARCHAR(128)  DEFAULT NULL,
  action_type     INT           NOT NULL                   COMMENT '1=泛词降权 2=精确准入 3=临时扶持 4=同集团打散',
  scope_terms     VARCHAR(255)  DEFAULT NULL               COMMENT '适用词/词类',
  exact_terms     VARCHAR(255)  DEFAULT NULL               COMMENT '精确准入白名单词',
  multiplier      DECIMAL(5,2)  NOT NULL DEFAULT 1.00      COMMENT '干预乘数 B(0.30~1.20)',
  region_code     VARCHAR(32)   DEFAULT NULL,
  surface         INT           DEFAULT NULL,
  biz_channel     INT           DEFAULT NULL,
  reason          VARCHAR(255)  NOT NULL                   COMMENT '干预原因(必填)',
  start_date      DATE          NOT NULL,
  end_date        DATE          NOT NULL                   COMMENT '到期自动失效',
  approval_status INT           NOT NULL DEFAULT 1         COMMENT '1=未审批 2=已审批 3=驳回',
  approver        VARCHAR(64)   DEFAULT NULL,
  status          INT           NOT NULL DEFAULT 1,
  created_by      VARCHAR(64)   DEFAULT NULL,
  updated_by      VARCHAR(64)   DEFAULT NULL,
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted         TINYINT       DEFAULT 0,
  UNIQUE KEY uk_search_intervention_no (rule_no),
  KEY idx_search_intervention_target (target_type, target_id, action_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索商家干预规则';

-- 5) 配置发布：不可变版本快照 + 审核 + 回退（不回滚财务账本）
CREATE TABLE IF NOT EXISTS biz_search_release (
  id              BIGINT        PRIMARY KEY AUTO_INCREMENT,
  version_no      VARCHAR(32)   NOT NULL,
  change_summary  VARCHAR(500)  NOT NULL,
  snapshot        LONGTEXT      DEFAULT NULL               COMMENT '发布快照(JSON)',
  checksum        VARCHAR(64)   DEFAULT NULL,
  status          INT           NOT NULL DEFAULT 0         COMMENT '0草稿 1待审 2批准 3待生效 4生效 5替代 6回滚',
  rollback_version VARCHAR(32)  DEFAULT NULL               COMMENT '兼容回退版本',
  approver        VARCHAR(64)   DEFAULT NULL,
  approve_time    DATETIME      DEFAULT NULL,
  published_at    DATETIME      DEFAULT NULL,
  created_by      VARCHAR(64)   DEFAULT NULL,
  updated_by      VARCHAR(64)   DEFAULT NULL,
  created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted         TINYINT       DEFAULT 0,
  UNIQUE KEY uk_search_release_no (version_no),
  KEY idx_search_release_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='搜索配置发布版本';
