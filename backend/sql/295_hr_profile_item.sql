-- 295_hr_profile_item.sql
-- C3 收口：人员档案扩展（教育 / 履历 / 资质 / 奖惩）
--
-- 仅作参照文档：真正执行的是启动期 HrProfileSchemaInitializer
-- （版本键 hcm:hr-profile-schema:v1.0，已登记 catalog.json）。
--
-- 五类合成一张表的理由：都是「挂在人员身上的档案证据行」，生命周期一致——
-- HR 手工维护、可附证据、需核实、无审批流、不参与日期生效与核算。

CREATE TABLE IF NOT EXISTS hr_profile_item (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    person_id     BIGINT       NOT NULL COMMENT '人员ID',
    item_type     VARCHAR(32)  NOT NULL COMMENT 'EDUCATION/WORK/QUALIFICATION/REWARD/PUNISH',
    title         VARCHAR(128) NOT NULL COMMENT '标题：学校/公司/证书/奖惩事项',
    org_name      VARCHAR(128) DEFAULT NULL COMMENT '机构：学校/公司/发证机构',
    role_title    VARCHAR(128) DEFAULT NULL COMMENT '专业/职位/等级',
    cert_no       VARCHAR(64)  DEFAULT NULL COMMENT '证书编号',
    start_date    DATE         DEFAULT NULL COMMENT '开始日期',
    end_date      DATE         DEFAULT NULL COMMENT '结束日期（空=至今/长期）',
    evidence_url  VARCHAR(500) DEFAULT NULL COMMENT '证据地址',
    evidence_name VARCHAR(128) DEFAULT NULL COMMENT '证据文件名',
    verify_status TINYINT      NOT NULL DEFAULT 0 COMMENT '0=待核实 1=已核实',
    remark        VARCHAR(255) DEFAULT NULL COMMENT '备注',
    updated_by    VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_hr_profile_person (person_id, item_type),
    CONSTRAINT fk_hr_profile_person FOREIGN KEY (person_id) REFERENCES person (id),
    CONSTRAINT ck_hr_profile_period CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
) COMMENT='人员档案扩展项';
