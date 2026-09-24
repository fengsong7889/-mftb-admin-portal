-- 193: 员工合同台账 emp_contract（P1-B）
-- 记录每位员工的劳动合同/协议：编号、类型、签约主体、起止/签订日期、状态。
-- 说明：本文件为一次性参考文档；实际建表 + 后置校验由 EmployeeDetailDataInitializer 的
--       applyOnce("employee:contract-schema-v1", createContractTable, verifyContractTable) 负责，
--       并登记于 db/migrations/catalog.json。生产仅 ADD，不做破坏性操作。

CREATE TABLE IF NOT EXISTS emp_contract (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id       BIGINT       NOT NULL COMMENT '关联 sys_user.id',
    contract_no   VARCHAR(64)  NOT NULL COMMENT '合同编号',
    contract_type VARCHAR(32)  DEFAULT NULL COMMENT '合同类型',
    company       VARCHAR(128) DEFAULT NULL COMMENT '签约主体名称',
    start_date    DATE         DEFAULT NULL COMMENT '合同开始日期',
    end_date      DATE         DEFAULT NULL COMMENT '合同结束日期',
    sign_date     DATE         DEFAULT NULL COMMENT '签订日期',
    status        VARCHAR(16)  DEFAULT NULL COMMENT '状态: 生效中/已终止/已过期',
    remark        VARCHAR(255) DEFAULT NULL COMMENT '备注',
    created_by    VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    updated_by    VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    INDEX idx_contract_user (user_id)
) COMMENT ='员工合同台账';
