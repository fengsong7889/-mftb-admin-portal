-- 294_emp_contract_lifecycle.sql
-- C4 第二批：合同台账生命周期字段（续签/变更链、解除事件、签署证据）
--
-- 仅作参照文档：真正执行的是启动期 EmpContractLifecycleInitializer
-- （版本键 hr:contract-lifecycle:v1.0，已登记 catalog.json）。ALTER 不可重放，
-- 初始化器逐列先查 information_schema 再补。

ALTER TABLE emp_contract
    ADD COLUMN change_type VARCHAR(16) NOT NULL DEFAULT 'NEW' COMMENT '变更类型 NEW/RENEW/CHANGE' AFTER status,
    ADD COLUMN previous_contract_id BIGINT DEFAULT NULL COMMENT '上一份合同ID（续签/变更链）' AFTER change_type,
    ADD COLUMN terminated_date DATE DEFAULT NULL COMMENT '解除/终止日期' AFTER previous_contract_id,
    ADD COLUMN terminate_reason VARCHAR(255) DEFAULT NULL COMMENT '解除原因' AFTER terminated_date,
    ADD COLUMN evidence_url VARCHAR(500) DEFAULT NULL COMMENT '签署证据地址' AFTER terminate_reason,
    ADD COLUMN evidence_name VARCHAR(128) DEFAULT NULL COMMENT '证据文件名' AFTER evidence_url;
