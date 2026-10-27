-- 207: RDM M3 交付与验收增强（验收用例 / 返工链路 / 遗留转需求 / 版本追溯）
-- 参考文档：实际执行由 RdmSchemaMigrationInitializer 走 rdm:schema:v1.3（applyOnce + 后置校验）完成。
-- 说明：本脚本只做 ADD / CREATE，不含任何破坏性操作。

-- ── 1. 验收单扩展：第几次验收、验收环境、缺陷数、遗留转出的后续需求 ──
-- attempt 而不是靠 count(rdm_acceptance) 现场数：验收历史一旦追加修订记录，
-- 「第几次验收」必须冻结在当时的序号上，否则一次通过率会被后续数据改写。
ALTER TABLE rdm_acceptance ADD COLUMN attempt INT NOT NULL DEFAULT 1 COMMENT '第几次验收(1=首次,>1=返工复验)' AFTER result;
ALTER TABLE rdm_acceptance ADD COLUMN test_env VARCHAR(16) DEFAULT NULL COMMENT '验收环境: prod/pre/uat' AFTER acceptor_name;
ALTER TABLE rdm_acceptance ADD COLUMN defect_count INT NOT NULL DEFAULT 0 COMMENT '本次缺陷数(用例未通过条数)' AFTER case_pass;
ALTER TABLE rdm_acceptance ADD COLUMN follow_up_req_id BIGINT DEFAULT NULL COMMENT '有条件通过时转出的后续需求ID' AFTER opinion;
ALTER TABLE rdm_acceptance ADD COLUMN follow_up_req_no VARCHAR(32) DEFAULT NULL COMMENT '后续需求编号快照' AFTER follow_up_req_id;

-- ── 2. 验收用例明细（逐条可验证，缺陷严重度决定能否带病上线） ──
CREATE TABLE IF NOT EXISTS rdm_acceptance_case (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    acceptance_id BIGINT NOT NULL COMMENT '验收单ID',
    req_id BIGINT NOT NULL COMMENT '需求ID(冗余,便于按需求聚合缺陷)',
    seq INT NOT NULL DEFAULT 1 COMMENT '用例序号',
    title VARCHAR(200) NOT NULL COMMENT '用例名称(来源PRD验收标准)',
    expect_result VARCHAR(500) DEFAULT NULL COMMENT '预期结果',
    actual_result VARCHAR(500) DEFAULT NULL COMMENT '实际结果',
    result VARCHAR(16) NOT NULL DEFAULT 'pass' COMMENT '用例结论: pass/fail/blocked',
    severity VARCHAR(16) DEFAULT NULL COMMENT '缺陷严重度: critical/major/minor/trivial',
    remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_rdm_case_acceptance (acceptance_id),
    KEY idx_rdm_case_req (req_id, result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-验收用例明细';

-- ── 3. 需求的来源链：验收遗留转出的后续需求要能回溯到原需求 ──
-- 不复用 source_channel：那列表达「从哪个端提交」，与「由哪条需求衍生」是两回事，
-- 混用会让渠道统计失真。
ALTER TABLE rdm_requirement ADD COLUMN parent_req_id BIGINT DEFAULT NULL COMMENT '衍生来源需求ID(验收遗留转后续需求)' AFTER source_channel;
ALTER TABLE rdm_requirement ADD COLUMN parent_req_no VARCHAR(32) DEFAULT NULL COMMENT '衍生来源需求编号快照' AFTER parent_req_id;

-- ── 4. 上线版本快照：验收追溯需要知道「哪一次验收对应的结论」是否随版本上线 ──
-- rdm_requirement.version_no 已有，这里补索引支撑「版本 → 需求」反查（追溯页主查询）。
ALTER TABLE rdm_requirement ADD INDEX idx_rdm_requirement_version (version_no, status);
