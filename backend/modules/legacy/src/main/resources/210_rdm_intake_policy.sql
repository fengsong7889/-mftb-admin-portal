-- 210: RDM 准入策略与审批轮次（阶段 2B）
-- 目的：把「这条需求要不要先审批、谁来分派」从客户端参数变成服务端可配置裁决，
--       并让每一轮审批都有独立留痕（旧回调不能推动新轮次）。
-- 说明：本文件是可读参考副本，实际执行的是 classpath 下的同名脚本；
--       rdm_requirement 的新增列由 Java 迁移逐列「先查再加」，不放在这里（ADD COLUMN 不可重复执行）。

-- ── 1. 准入策略 ──
CREATE TABLE IF NOT EXISTS rdm_intake_policy (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    name VARCHAR(128) NOT NULL COMMENT '策略名称（会出现在需求的准入判定说明里）',
    mode VARCHAR(16) NOT NULL DEFAULT 'APPROVE' COMMENT '准入动作: FORCE_APPROVE=强制需审批 APPROVE=需审批 EXEMPT=免审直送技术部',
    scope_dept_ids VARCHAR(255) DEFAULT NULL COMMENT '适用部门ID列表(逗号分隔)，空=不限部门',
    scope_dept_names VARCHAR(512) DEFAULT NULL COMMENT '适用部门名称快照(逗号分隔)，用于展示与名称命中',
    include_sub_dept TINYINT NOT NULL DEFAULT 0 COMMENT '是否含下级部门: 1=含 0=仅本部门',
    scope_roles VARCHAR(255) DEFAULT NULL COMMENT '适用角色编码/名称列表(逗号分隔)，空=不限角色',
    scope_systems VARCHAR(255) DEFAULT NULL COMMENT '适用系统编码列表(逗号分隔)，空=不限系统',
    scope_req_types VARCHAR(255) DEFAULT NULL COMMENT '适用需求类型列表(逗号分隔)，空=不限类型',
    approval_nodes VARCHAR(512) DEFAULT NULL COMMENT '审批节点名称(按顺序执行，逗号分隔)；缺失则该轮进入审批异常待办',
    dispatcher_user_id BIGINT DEFAULT NULL COMMENT '默认分派责任人（技术负责人）sys_user.id',
    dispatcher_name VARCHAR(64) DEFAULT NULL COMMENT '默认分派责任人姓名快照',
    priority INT NOT NULL DEFAULT 10 COMMENT '命中优先级（越小越优先；同优先级条件重叠禁止保存）',
    effective_from DATE NOT NULL COMMENT '生效开始日期',
    effective_to DATE DEFAULT NULL COMMENT '生效结束日期，空=长期有效',
    version VARCHAR(16) NOT NULL DEFAULT 'v1' COMMENT '规则版本，在途需求绑定发起时的版本',
    status TINYINT NOT NULL DEFAULT 0 COMMENT '启用: 1=启用 0=停用（新建默认停用，避免半套条件直接上线）',
    remark VARCHAR(512) DEFAULT NULL COMMENT '适用说明/免审理由',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_rdm_policy_hit (status, deleted, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-需求准入策略（谁提的需求要不要先审批、走哪条审批链）';

-- ── 2. 准入审批轮次 ──
-- 每一轮提交对应一条记录：绑定本轮内容快照、命中的策略版本与 OA 准入单号。
-- 旧轮次的回调只能落在旧轮次上，不能推动已经重提的需求。
CREATE TABLE IF NOT EXISTS rdm_intake_round (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT NOT NULL COMMENT '需求ID rdm_requirement.id',
    round_no INT NOT NULL COMMENT '第几轮提交（从 1 递增，历史轮次不覆盖）',
    flow_no VARCHAR(64) DEFAULT NULL COMMENT '本轮准入单号 biz_oa_request.flow_no，空=免审轮次无审批单',
    decision VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '轮次结论: pending/approved/rejected/withdrawn/exempt',
    need_approval TINYINT NOT NULL DEFAULT 1 COMMENT '本轮是否需审批（服务端裁决结果，非客户端参数）',
    policy_id BIGINT DEFAULT NULL COMMENT '命中的准入策略ID，空=使用内置默认策略',
    policy_name VARCHAR(128) DEFAULT NULL COMMENT '命中策略名称快照',
    policy_version VARCHAR(16) DEFAULT NULL COMMENT '命中策略版本快照',
    policy_mode VARCHAR(16) DEFAULT NULL COMMENT '命中策略动作快照',
    match_explain TEXT COMMENT '命中链路（为什么免审/为什么要审，事后审计用）',
    submit_dept_id BIGINT DEFAULT NULL COMMENT '提交时提出部门ID快照',
    submit_dept_name VARCHAR(128) DEFAULT NULL COMMENT '提交时提出部门名称快照',
    submitter_user_id BIGINT DEFAULT NULL COMMENT '本轮提交人 sys_user.id',
    submitter_name VARCHAR(64) DEFAULT NULL COMMENT '本轮提交人姓名快照',
    content_snapshot TEXT COMMENT '本轮提交内容摘要快照（标题/类型/优先级，用于证明审批的是哪一版）',
    submit_time DATETIME DEFAULT NULL COMMENT '本轮提交时间',
    decide_time DATETIME DEFAULT NULL COMMENT '本轮审结时间',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_intake_round (req_id, round_no),
    UNIQUE KEY uk_rdm_intake_flow (flow_no),
    KEY idx_rdm_intake_decision (decision, submit_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-准入审批轮次（每轮独立内容与OA实例，旧回调不能推动新轮次）';
