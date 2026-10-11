-- =============================================================================
-- 221 车辆参数库（品牌 → 车系 → 年款车型）
--
-- 为什么建三级而不是让车辆档案手填文本：
--   手填「寶馬 5系」这类自由文本会让同一台车在台账里出现多种写法（寶馬5系 / BMW 5系 /
--   5系），统计「各车系使用率」「按品牌分摊费用」时全部失真；而企业车队一旦上百台，
--   手填成本也会失控。参照懂车帝/汽车之家的层级是 品牌 → 车系 → 具体车型(年款配置)，
--   本项目按同样的三级建模，车辆档案逐级选择、不再手打。
--
-- 字段取舍（与汽车电商的差异）：
--   只保留影响**用车决策与费用**的参数（车身形式、能源类型、座位数、排量、变速箱、
--   厂商建议价），不做配置表级别的细粒度参数（轮毂、屏幕、辅助驾驶…）。
--   理由：车队管理关心「这台车能坐几人、跑不跑得长途、值多少钱」，参数越多维护成本越高，
--   而主数据一旦由人维护就会腐烂。真需要完整参数时由第三方数据源导入，不靠人工录入。
--
-- 方言约束：MySQL 8 / InnoDB / utf8mb4；软删感知的唯一键用 STORED 生成列实现
--   （MySQL 没有「唯一键排除已删除行」的语法，软删行会一直占住唯一键）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 车辆品牌
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle_brand (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    brand_name    VARCHAR(60)  NOT NULL COMMENT '品牌名称，如 寶馬 / 保时捷',
    brand_name_en VARCHAR(60)  NULL COMMENT '品牌英文名，供多语言展示',
    country_origin VARCHAR(30) NULL COMMENT '产地国家/地区，如 德國 / 日本',
    status        VARCHAR(20)  NOT NULL DEFAULT 'enabled' COMMENT '狀態：enabled/disabled',
    sort_order    INT          NOT NULL DEFAULT 0 COMMENT '展示顺序',
    remark        VARCHAR(200) NULL COMMENT '备注',
    created_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '更新人',
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted       TINYINT      NOT NULL DEFAULT 0 COMMENT '软删除：0正常 1已删',
    -- 软删感知唯一键：只有未删除行参与「品牌名不重复」约束
    active_name   VARCHAR(60) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN brand_name ELSE NULL END) STORED
        COMMENT '生成列：未删除时的品牌名，用于唯一约束',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_brand_name (active_name),
    KEY idx_vehicle_brand_status (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='车辆品牌（车辆参数库第一级）';

-- -----------------------------------------------------------------------------
-- 2. 车系（宝马5系 / 7系 / Cayenne）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle_series (
    id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    brand_id     BIGINT       NOT NULL COMMENT '所属品牌 ID',
    series_name  VARCHAR(80)  NOT NULL COMMENT '车系名称，如 5系 / Cayenne',
    -- 车身形式与能源类型是「车辆档案」要带出的默认值，也是车牌位数判定的依据
    body_type    VARCHAR(20)  NOT NULL DEFAULT 'sedan' COMMENT '車身形式：sedan/suv/mpv/van/bus/pickup/coupe',
    energy_type  VARCHAR(20)  NOT NULL DEFAULT 'petrol' COMMENT '能源類型：petrol/diesel/hybrid/phev/ev',
    seat_count   INT          NOT NULL DEFAULT 5 COMMENT '默认核定载客人数（档案可覆盖）',
    status       VARCHAR(20)  NOT NULL DEFAULT 'enabled' COMMENT '狀態：enabled/disabled',
    remark       VARCHAR(200) NULL COMMENT '备注',
    created_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '更新人',
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted      TINYINT      NOT NULL DEFAULT 0 COMMENT '软删除：0正常 1已删',
    active_key   VARCHAR(140) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(brand_id, '|', series_name) ELSE NULL END) STORED
        COMMENT '生成列：品牌内车系名唯一',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_series_brand_name (active_key),
    KEY idx_vehicle_series_brand (brand_id, status),
    CONSTRAINT fk_vehicle_series_brand FOREIGN KEY (brand_id) REFERENCES biz_vehicle_brand (id),
    CONSTRAINT ck_vehicle_series_body CHECK
        (body_type IN ('sedan', 'suv', 'mpv', 'van', 'bus', 'pickup', 'coupe')),
    CONSTRAINT ck_vehicle_series_energy CHECK
        (energy_type IN ('petrol', 'diesel', 'hybrid', 'phev', 'ev')),
    CONSTRAINT ck_vehicle_series_seat CHECK (seat_count > 0 AND seat_count <= 60)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='车系（车辆参数库第二级）';

-- -----------------------------------------------------------------------------
-- 3. 年款车型（2024款 530Li 领先型）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_vehicle_model (
    id            BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    series_id     BIGINT        NOT NULL COMMENT '所属车系 ID',
    model_name    VARCHAR(80)   NOT NULL COMMENT '车型名称，如 530Li 領先型',
    year_label    VARCHAR(16)   NOT NULL DEFAULT '' COMMENT '年款，如 2024款；未知填未知',
    -- 车籍与车牌位数相关：新能源(纯电/插混)上 8 位牌，燃油/油电混合上 7 位牌
    displacement  VARCHAR(20)   NULL COMMENT '排量，如 2.0T；纯电可空',
    gearbox       VARCHAR(20)   NULL COMMENT '变速箱，如 手自一體 / 單速變速器',
    seat_count    INT           NULL COMMENT '该年款座位数（覆盖车系默认值）',
    base_price    DECIMAL(12,2) NULL COMMENT '厂商建议价（用于资产原值参考，金额禁用 float）',
    status        VARCHAR(20)   NOT NULL DEFAULT 'enabled' COMMENT '狀態：enabled/disabled',
    remark        VARCHAR(200)  NULL COMMENT '备注',
    created_by    VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '创建人',
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by    VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '更新人',
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted       TINYINT       NOT NULL DEFAULT 0 COMMENT '软删除：0正常 1已删',
    active_key    VARCHAR(160) GENERATED ALWAYS AS (
        CASE WHEN deleted = 0 THEN CONCAT(series_id, '|', model_name, '|', year_label) ELSE NULL END) STORED
        COMMENT '生成列：同车系下「车型+年款」唯一',
    PRIMARY KEY (id),
    UNIQUE KEY uk_vehicle_model_series_name_year (active_key),
    KEY idx_vehicle_model_series (series_id, status),
    CONSTRAINT fk_vehicle_model_series FOREIGN KEY (series_id) REFERENCES biz_vehicle_series (id),
    CONSTRAINT ck_vehicle_model_price CHECK (base_price IS NULL OR base_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='年款车型（车辆参数库第三级）';

-- -----------------------------------------------------------------------------
-- 4. 车辆档案接入参数库
--
-- 由 VehicleSchemaMigrationInitializer 的 REQUIRED_ADDED_COLUMNS 逐列先查后加
-- （MySQL 8 无 ADD COLUMN IF NOT EXISTS，且 220 的 CREATE TABLE IF NOT EXISTS
--  在表已存在时整条不生效，写在 DDL 里的新列对已建库永远不会出现）。
-- 这里同时补进 220 的建表语句，保证新库一次建成与线上补齐后结构一致。
--
--   brand_id / series_id / model_id  三级外键，均可空（历史车允许只有文本快照）
--   body_type / energy_type          从车系带出，作为车牌位数与台账统计的依据
--
-- 为什么不建强外键到 biz_vehicle：车辆档案可能早于参数库录入，且历史数据没有
-- brand_id；用可空列 + 应用层校验（选了车系就必须属于所选品牌）比让启动因脏数据失败更稳。
-- -----------------------------------------------------------------------------
