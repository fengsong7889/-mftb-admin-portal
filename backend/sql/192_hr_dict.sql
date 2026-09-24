-- 192: HR 人事通用字典 sys_hr_dict（P1-A）
-- 单表多类型（dict_type 区分）：EMPLOYER_COMPANY 雇主法人 / WORK_LOCATION 工作地点（城市 parent_code 指向国家 code）/ EMPLOYEE_CATEGORY 人员类别。
-- 与购买公司字典 sys_purchase_company 独立：法人身份 ≠ 采购主体，不与品牌 / 商家集团混用。
-- 说明：本文件为一次性参考文档；实际建表 + 幂等种子（INSERT IGNORE）+ 后置校验由 HrDictSchemaInitializer
--       的 applyOnce("hr:dict-schema-v1", migrate, verify) 负责，并登记于 db/migrations/catalog.json。

CREATE TABLE IF NOT EXISTS sys_hr_dict (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    dict_type   VARCHAR(32)  NOT NULL COMMENT '字典类型: EMPLOYER_COMPANY/WORK_LOCATION/EMPLOYEE_CATEGORY 等',
    code        VARCHAR(64)  NOT NULL COMMENT '稳定编码',
    name        VARCHAR(128) NOT NULL COMMENT '名称',
    name_en     VARCHAR(128) DEFAULT NULL COMMENT '英文名称',
    parent_code VARCHAR(64)  DEFAULT NULL COMMENT '上级code(工作地点城市指向国家code)',
    status      TINYINT      NOT NULL DEFAULT 1 COMMENT '1=启用 0=停用',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序(升序)',
    remark      VARCHAR(255) DEFAULT NULL COMMENT '备注',
    created_by  VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    updated_by  VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted     TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_hr_dict_type_code (dict_type, code),
    KEY idx_hr_dict_type_status (dict_type, status)
) COMMENT ='HR人事通用字典';

-- 种子（幂等，实际由 Java 迁移执行）：
--   EMPLOYER_COMPANY: SF-TECH 珠海闪蜂科技有限公司 / MF-TECH 珠海麦峰科技有限公司
--   EMPLOYEE_CATEGORY: REGULAR 正式员工 / INTERN 实习生 / DISPATCH 劳务派遣 / OUTSOURCE 外包
--   WORK_LOCATION: CN 中国 / HK 香港 / MO 澳门 / TW 台湾 + CN-* 主要城市（parent_code=CN）
