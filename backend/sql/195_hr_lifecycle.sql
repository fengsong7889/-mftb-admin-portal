-- 195: 集团人事(HR) 入转调离全生命周期单据表 hr_lifecycle_request
-- 覆盖四类流程单据：入職(onboard)/轉正(regular)/調動(transfer)/離職(dimission)，
-- 单据提交后关联 OA 审批流程（biz_oa_request.flow_no），审批全部通过后回调执行办理动作
-- （建账号/写职务记录/离职停用），状态机：draft → pending → approved/rejected → completed。
-- 说明：本文件为一次性参考文档；实际建表 + 后置校验由 HrLifecycleSchemaInitializer 的
--       applyOnce("hr:lifecycle-schema:v1.0", task, verify) 负责，并登记于 db/migrations/catalog.json。
--       生产仅 ADD，不做破坏性操作。

CREATE TABLE IF NOT EXISTS hr_lifecycle_request (
    id                    BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_no                VARCHAR(32)  NOT NULL COMMENT '单据编号(RS+YYYYMMDD+4位序号, 规则 hr_lifecycle_request)',
    type                  VARCHAR(16)  NOT NULL COMMENT '单据类型: onboard/regular/transfer/dimission',
    status                VARCHAR(16)  NOT NULL DEFAULT 'draft' COMMENT '单据状态: draft/pending/approved/rejected/completed',
    flow_no               VARCHAR(64)  DEFAULT NULL COMMENT '关联OA流程编号(biz_oa_request.flow_no), 每次提交生成新流程',
    -- 目标员工（入职单为候选人, 账号创建后回填 user_id/emp_no）
    user_id               BIGINT       DEFAULT NULL COMMENT '关联 sys_user.id(入职完成后回填)',
    emp_name              VARCHAR(64)  NOT NULL COMMENT '姓名/候选人姓名',
    emp_no                VARCHAR(32)  DEFAULT NULL COMMENT '员工工号(入职完成后回填)',
    dept_id               BIGINT       DEFAULT NULL COMMENT '目标部门ID(入职=入职部门)',
    dept_name             VARCHAR(128) DEFAULT NULL COMMENT '部门名称快照',
    position_id           BIGINT       DEFAULT NULL COMMENT '职位ID(关联 sys_position)',
    position_name         VARCHAR(128) DEFAULT NULL COMMENT '职位名称快照',
    effective_date        DATE         DEFAULT NULL COMMENT '生效日期(入职单=计划入职日期)',
    reason                VARCHAR(512) DEFAULT NULL COMMENT '申请事由',
    -- 入职明细
    offer_date            DATE         DEFAULT NULL COMMENT 'Offer发放日期',
    probation_months      INT          DEFAULT NULL COMMENT '试用期月数(0=无试用期直接转正)',
    expected_regular_date DATE         DEFAULT NULL COMMENT '预计转正日期',
    id_card_no            VARCHAR(64)  DEFAULT NULL COMMENT '证件号码(入职重复校验)',
    mobile                VARCHAR(32)  DEFAULT NULL COMMENT '手机号',
    email                 VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
    candidate_info        JSON         DEFAULT NULL COMMENT '入职资料JSON(学历/工作经历/银行信息等)',
    -- 调动明细
    old_dept_name         VARCHAR(128) DEFAULT NULL COMMENT '调动前部门快照',
    old_position_name     VARCHAR(128) DEFAULT NULL COMMENT '调动前职位快照',
    new_dept_id           BIGINT       DEFAULT NULL COMMENT '调入部门ID',
    new_dept_name         VARCHAR(128) DEFAULT NULL COMMENT '调入部门名称快照',
    new_position_id       BIGINT       DEFAULT NULL COMMENT '调入职位ID',
    new_position_name     VARCHAR(128) DEFAULT NULL COMMENT '调入职位名称快照',
    new_company           VARCHAR(128) DEFAULT NULL COMMENT '调动后任职公司(HR字典 EMPLOYER_COMPANY)',
    new_superior          VARCHAR(64)  DEFAULT NULL COMMENT '调动后直属上级',
    -- 离职明细
    dimission_type        VARCHAR(32)  DEFAULT NULL COMMENT '离职类型: voluntary=主动/involuntary=被动/expired=合同到期',
    last_work_date        DATE         DEFAULT NULL COMMENT '最后工作日',
    settlement_info       JSON         DEFAULT NULL COMMENT '离职结算JSON(资产归还/薪资结算/交接说明等)',
    -- 办理结果
    remark                VARCHAR(512) DEFAULT NULL COMMENT '备注/办理结果说明',
    created_by            VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    updated_by            VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at            DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at            DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted               TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_hlr_req_no (req_no),
    KEY idx_hlr_type_status (type, status),
    KEY idx_hlr_user (user_id),
    KEY idx_hlr_flow_no (flow_no),
    KEY idx_hlr_emp_no (emp_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR入转调离生命周期单据';

-- ── OA 流程定义种子（复用 oa_general 通用审批节点配置, 可在「流程配置」中为 HR 单独编排）──
INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, workflow_type, sort_order, status) VALUES
    ('hr_onboard',   '入職手續', 'hr', 'UserAddOutlined',     '新員工入職登記與賬號開通審批流程', 'oa_general', 11, 1),
    ('hr_regular',   '轉正申請', 'hr', 'CheckCircleOutlined', '試用期員工轉正審批流程',           'oa_general', 12, 1),
    ('hr_transfer',  '調動申請', 'hr', 'SwapOutlined',        '員工部門/職位調動審批流程',         'oa_general', 13, 1),
    ('hr_dimission', '離職手續', 'hr', 'UserDeleteOutlined',  '員工離職結算與賬號停用審批流程',    'oa_general', 14, 1);

-- ── 单据编号规则种子（RS + YYYYMMDD + 4位自增序号, 归属集团人事）──
INSERT IGNORE INTO sys_biz_seq_rule
    (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES
    ('hr_lifecycle_request', 'HR入轉調離單據編號', '集團人事', 'RS', 'YYYYMMDD', 4, 1, 1,
     '{prefix} + YYYYMMDD + {n}位自增序號');

-- ── HR 菜单种子（二级菜单, 挂 hr 分组; 实际插入由 HrLifecycleMenuInitializer 幂等执行）──
-- hr-onboarding(入職管理) / hr-regularization(轉正管理) / hr-transfer(調動管理) / hr-dimission(離職管理)
