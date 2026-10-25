-- 292_hcm_person_core.sql
-- HCM 阶段 C2：人员主数据（Person → Employment → Assignment）
--
-- 仅作参照文档：真正执行的是启动期 HcmPersonSchemaInitializer
-- （版本键 hcm:person-schema:v1.0，已登记 catalog.json）。
--
-- 本批不开放接口与菜单：C2 的验收是无账号建档 / 返聘 / 跨法人 / 未来生效 / 同日多次
-- 这些数据级用例；对外 API 与花名册界面随 C3 交付。

CREATE TABLE IF NOT EXISTS person (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    person_no    VARCHAR(32)  DEFAULT NULL COMMENT '集团工号（稳定业务键）',
    name         VARCHAR(64)  NOT NULL COMMENT '姓名',
    name_en      VARCHAR(128) DEFAULT NULL COMMENT '英文名',
    gender       VARCHAR(8)   DEFAULT NULL COMMENT 'M/F/UNKNOWN',
    birth_date   DATE         DEFAULT NULL COMMENT '出生日期',
    mobile       VARCHAR(32)  DEFAULT NULL COMMENT '手机号',
    email        VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
    nationality  VARCHAR(8)   DEFAULT NULL COMMENT '国籍 ISO 3166-1',
    sys_user_id  BIGINT       DEFAULT NULL COMMENT '账号映射 sys_user.id（为空=无账号人员）',
    status       TINYINT      NOT NULL DEFAULT 1 COMMENT '1=在职体系内 0=已退出',
    remark       VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by   VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted      TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_person_no (person_no),
    UNIQUE KEY uk_person_sys_user (sys_user_id),
    KEY idx_person_name (name)
) COMMENT='人员主数据';

CREATE TABLE IF NOT EXISTS hr_employment (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    person_id        BIGINT      NOT NULL COMMENT '人员ID',
    legal_entity_id  BIGINT      NOT NULL COMMENT '雇主法人ID',
    employment_no    VARCHAR(32) DEFAULT NULL COMMENT '雇佣编号（稳定业务键）',
    employment_type  VARCHAR(32) NOT NULL DEFAULT 'FULL_TIME' COMMENT '雇佣类型',
    jurisdiction     VARCHAR(8)  NOT NULL DEFAULT 'CN' COMMENT '法域 CN/HK/MO',
    start_date       DATE        NOT NULL COMMENT '雇佣开始日期',
    end_date         DATE        DEFAULT NULL COMMENT '雇佣结束日期（空=无固定期限）',
    status           TINYINT     NOT NULL DEFAULT 1 COMMENT '1=有效 0=已终止',
    remark           VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by       VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at       DATETIME    DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at       DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted          TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_hr_employment_no (employment_no),
    KEY idx_hr_employment_person (person_id, start_date),
    KEY idx_hr_employment_legal (legal_entity_id),
    CONSTRAINT fk_hr_employment_person FOREIGN KEY (person_id) REFERENCES person (id),
    CONSTRAINT fk_hr_employment_legal FOREIGN KEY (legal_entity_id) REFERENCES org_legal_entity (id),
    CONSTRAINT ck_hr_employment_period CHECK (end_date IS NULL OR end_date >= start_date)
) COMMENT='雇佣关系';

CREATE TABLE IF NOT EXISTS hr_assignment (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    employment_id     BIGINT       NOT NULL COMMENT '雇佣关系ID',
    unit_id           BIGINT       NOT NULL COMMENT '任职组织ID',
    position_id       BIGINT       DEFAULT NULL COMMENT '岗位ID（空=未定岗）',
    manager_person_id BIGINT       DEFAULT NULL COMMENT '直属经理（person.id）',
    work_location     VARCHAR(128) DEFAULT NULL COMMENT '工作地点',
    fte               DECIMAL(5,2) NOT NULL DEFAULT 1.00 COMMENT 'FTE 0.01~1.00',
    primary_flag      TINYINT      NOT NULL DEFAULT 1 COMMENT '1=主任职 0=兼任',
    effective_from    DATE         NOT NULL COMMENT '生效起（含）',
    effective_to      DATE         DEFAULT NULL COMMENT '生效止（含，空=持续）',
    seq_no            INT          NOT NULL DEFAULT 1 COMMENT '同日序号',
    remark            VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by        VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted           TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    -- 生成列只对「未结束且未删除的主任职」取 employment_id，其余为 NULL；
    -- 唯一键因此只约束这一类行：并发提交两份主任职时服务层检查会同时通过，必须由数据库兜住
    primary_effective BIGINT GENERATED ALWAYS AS (
        CASE WHEN primary_flag = 1 AND effective_to IS NULL AND deleted = 0 THEN employment_id ELSE NULL END
    ) STORED COMMENT '主任职唯一约束载体',
    UNIQUE KEY uk_hr_assignment_primary (primary_effective),
    UNIQUE KEY uk_hr_assignment_version (employment_id, effective_from, seq_no),
    KEY idx_hr_assignment_unit (unit_id),
    KEY idx_hr_assignment_period (employment_id, effective_from, effective_to),
    CONSTRAINT fk_hr_assignment_employment FOREIGN KEY (employment_id) REFERENCES hr_employment (id),
    CONSTRAINT fk_hr_assignment_unit FOREIGN KEY (unit_id) REFERENCES org_unit (id),
    CONSTRAINT fk_hr_assignment_position FOREIGN KEY (position_id) REFERENCES org_position (id),
    CONSTRAINT ck_hr_assignment_fte CHECK (fte > 0 AND fte <= 1),
    CONSTRAINT ck_hr_assignment_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
) COMMENT='任职（日期生效）';
