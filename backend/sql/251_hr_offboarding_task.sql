-- 251: 离职联动任务表 hr_offboarding_task + 离职单据交接接收人（方案 §7.4 离职联动 / §7.2「离职增加交接责任人任务」）
-- 背景：离职办理要连带触发两件跨模块的事——EAM 资产交接、OA 待办审批改派。
--       「审批人离职后待办留在自己身上」会让流程永久卡死：OaRequestServiceImpl 的
--       requireNodeApprover 是 fail-closed（不是审批人就拒），而 biz_oa_approval_task.approver
--       存的是「姓名(工号)」字符串，没有任何改派入口。
-- 为什么不能离职事务里同步做完：交接接收人可能在离职办理之后才被指定；EAM 也可能拒绝登记
--   （资产状态不符）。同步做就把「离职办理成功」绑死在「外部模块此刻可用」上。
-- 为什么不复用 hr_effective_task：那张表是「一单一行」的到期执行凭据，本表是「一单多行」的
--   跨模块动作清单；混用会让唯一键和「到期」语义都失去含义。
-- 不回填历史离职单据：它们的资产与待办早已人工处置，凭空补一批 PENDING 只会制造无法判断真伪的待办。
-- 说明：本文件为一次性参考文档；实际执行与后置校验由 HrOffboardingSchemaInitializer
--       （hr:offboarding-schema:v1.0，@Order(34)）负责，并登记 catalog.json 与 ContractRegistry。

CREATE TABLE IF NOT EXISTS hr_offboarding_task (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    request_id      BIGINT       NOT NULL COMMENT '关联离职单据 hr_lifecycle_request.id',
    req_no          VARCHAR(32)  DEFAULT NULL COMMENT '单据编号快照',
    user_id         BIGINT       DEFAULT NULL COMMENT '离职员工ID(sys_user.id)',
    emp_no          VARCHAR(32)  DEFAULT NULL COMMENT '离职工号快照',
    task_type       VARCHAR(32)  NOT NULL COMMENT '任务类型: EAM_ASSET_HANDOVER / OA_TODO_TRANSFER',
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/RUNNING/DONE/SKIPPED/FAILED',
    attempts        INT          NOT NULL DEFAULT 0 COMMENT '已尝试次数',
    last_error      VARCHAR(500) DEFAULT NULL COMMENT '最近一次失败原因（含「未指定接收人」这类等待说明）',
    result_summary  VARCHAR(500) DEFAULT NULL COMMENT '执行结果摘要（交接几项资产 / 改派几个节点）',
    target_ref      VARCHAR(64)  DEFAULT NULL COMMENT '跨模块产物引用：EAM 交接单号 或 被改派的 OA 任务 id 列表',
    effective_date  DATE         DEFAULT NULL COMMENT '计划执行日（离职生效日），到这天才到期',
    created_by      VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    updated_by      VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    -- 同一离职单的同类动作只能有一行：这是「重试不重复建交接单」的库层依据（§7.4）
    UNIQUE KEY uk_offboarding_request_type (request_id, task_type),
    KEY idx_offboarding_status_date (status, effective_date),
    KEY idx_offboarding_user (user_id),
    CONSTRAINT ck_offboarding_status CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'SKIPPED', 'FAILED')),
    CONSTRAINT ck_offboarding_type CHECK (task_type IN ('EAM_ASSET_HANDOVER', 'OA_TODO_TRANSFER'))
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT ='离职联动任务（轻量 outbox）';

-- 离职单据增加交接接收人：资产交给谁、待办转给谁必须由人指定，
-- 不由代码默认取直属上级——那会让人误以为接手是被同意的。
ALTER TABLE hr_lifecycle_request ADD COLUMN handover_to_user_id BIGINT DEFAULT NULL COMMENT '交接接收人ID(sys_user.id)';
ALTER TABLE hr_lifecycle_request ADD COLUMN handover_to_name    VARCHAR(128) DEFAULT NULL COMMENT '交接接收人姓名快照';

-- 边界（方案 §7.4 原文）：离职联动只创建/关联资产交接任务；资产的实际归还与持有人变化
-- 仍由 EAM 的合法业务动作完成，本表不越过 EAM 改 eam_asset.current_holder_id。
