-- 196: HR 入转调离引擎扩展第五类单据「合同續簽」(P0 合同到期预警与续签)
-- 在 hr_lifecycle_request 上补齐合同维度字段，续签单审批通过后自动写入新合同并终止原合同。
-- 说明：本文件为一次性参考文档；实际加列 + 后置校验由 HrLifecycleRenewSchemaInitializer 的
--       applyOnce("hr:lifecycle-renew:v1.0", task, verify) 负责（MySQL 不支持 ADD COLUMN IF NOT EXISTS，
--       先查 INFORMATION_SCHEMA.COLUMNS），并登记 db/migrations/catalog.json 与 ContractRegistry 列契约。
--       生产仅 ADD，不做破坏性操作。

ALTER TABLE hr_lifecycle_request ADD COLUMN contract_id BIGINT DEFAULT NULL COMMENT '被续签/变更的原合同ID(emp_contract.id)';
ALTER TABLE hr_lifecycle_request ADD COLUMN contract_no VARCHAR(64) DEFAULT NULL COMMENT '原合同编号快照';
ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_no VARCHAR(64) DEFAULT NULL COMMENT '新合同编号';
ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_type VARCHAR(32) DEFAULT NULL COMMENT '新合同类型(HR字典 CONTRACT_TYPE)';
ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_company VARCHAR(128) DEFAULT NULL COMMENT '新合同签约主体(HR字典 EMPLOYER_COMPANY)';
ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_start_date DATE DEFAULT NULL COMMENT '新合同开始日期';
ALTER TABLE hr_lifecycle_request ADD COLUMN new_contract_end_date DATE DEFAULT NULL COMMENT '新合同结束日期';

-- OA 流程定义种子：合同续签走 hr 分类，默认挂 oa_general 通用审批节点
INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, workflow_type, sort_order, status) VALUES
    ('hr_renew', '合同續簽', 'hr', 'FileSyncOutlined', '勞動合同到期續簽審批流程，通過後自動寫入新合同', 'oa_general', 15, 1);
