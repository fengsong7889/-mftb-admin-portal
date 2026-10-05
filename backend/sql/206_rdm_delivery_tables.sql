-- 206: RDM 需求全生命周期 M2（PRD / 评审 / 迭代排期 / 执行任务与工时 / 需求变更）
--      一次性参考文档；实际执行与幂等由 RdmSchemaMigrationInitializer 负责。
--      版本键: rdm:schema:v1.2（建表 + 编号规则 + 变更审批流程定义）
--      方言：MySQL 8.x，全部 CREATE TABLE IF NOT EXISTS / INSERT IGNORE，可重复执行。
--      设计约束：
--        1. L1 业务需求(rdm_requirement) → L2 产品需求(rdm_prd) → L3 执行任务(rdm_work_task) 三层可追溯；
--        2. 任务完成度只汇总，需求状态的推进仍以 rdm_transition 配置为准（不在代码里硬编码流转）；
--        3. 工日是产出量化与绩效对接的原始数据，禁止用"更新时间"倒推。

-- ── 1. L2 产品需求（PRD）：一条业务需求可拆多份 PRD ──
CREATE TABLE IF NOT EXISTS rdm_prd (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    prd_no VARCHAR(32) NOT NULL COMMENT 'PRD編號 PRD+YYYYMMDD+4位',
    req_id BIGINT NOT NULL COMMENT '所屬業務需求 rdm_requirement.id',
    parent_prd_id BIGINT DEFAULT NULL COMMENT '父 PRD（支持逐級拆解）',
    title VARCHAR(200) NOT NULL COMMENT 'PRD 標題',
    target_users VARCHAR(255) DEFAULT NULL COMMENT '目標用戶與場景',
    feature_list TEXT COMMENT '功能清單（結構化文本/JSON）',
    acceptance_criteria TEXT COMMENT '驗收標準（逐條可驗證）',
    content_rich MEDIUMTEXT COMMENT 'PRD 正文（富文本 HTML）',
    prototype_url VARCHAR(500) DEFAULT NULL COMMENT '原型/設計稿連結',
    status VARCHAR(24) NOT NULL DEFAULT 'draft' COMMENT '狀態: draft/reviewing/approved/rejected/archived',
    version_no VARCHAR(16) NOT NULL DEFAULT 'v1.0' COMMENT '文檔版本',
    author_user_id BIGINT DEFAULT NULL COMMENT '編寫人（產品經理）ID',
    author_name VARCHAR(64) DEFAULT NULL COMMENT '編寫人姓名',
    review_time DATETIME DEFAULT NULL COMMENT '評審完成時間',
    review_conclusion VARCHAR(500) DEFAULT NULL COMMENT '評審結論',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_prd_no (prd_no),
    KEY idx_rdm_prd_req (req_id, status),
    KEY idx_rdm_prd_author (author_user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-产品需求PRD（L2，可多级拆解）';

-- ── 2. 评审记录：需求评审/研发评审/UI评审/测试评审 ──
CREATE TABLE IF NOT EXISTS rdm_review (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    review_no VARCHAR(32) NOT NULL COMMENT '評審編號 RV+YYYYMMDD+4位',
    req_id BIGINT NOT NULL COMMENT '業務需求ID',
    prd_id BIGINT DEFAULT NULL COMMENT '被評審的 PRD（需求级评审可空）',
    review_type VARCHAR(24) NOT NULL COMMENT '評審類型: requirement/dev/ui/test',
    review_time DATETIME DEFAULT NULL COMMENT '評審時間',
    participants VARCHAR(1000) DEFAULT NULL COMMENT '參與人（逗號分隔姓名，便於展示）',
    participant_ids VARCHAR(500) DEFAULT NULL COMMENT '參與人ID列表（逗號分隔，通知用）',
    conclusion VARCHAR(24) NOT NULL DEFAULT 'pending' COMMENT '結論: pending/passed/rejected',
    conclusion_desc VARCHAR(1000) DEFAULT NULL COMMENT '結論說明',
    affects_schedule_flag TINYINT NOT NULL DEFAULT 0 COMMENT '結論是否影響排期（需回填計劃時間）',
    attachment_ids VARCHAR(500) DEFAULT NULL COMMENT '附件ID列表',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_review_no (review_no),
    KEY idx_rdm_review_req (req_id, review_type),
    KEY idx_rdm_review_prd (prd_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-评审记录（需求/研发/UI/测试）';

-- ── 3. 迭代/版本排期 ──
CREATE TABLE IF NOT EXISTS rdm_iteration (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code VARCHAR(32) NOT NULL COMMENT '迭代編碼，如 SP2026-10A',
    name VARCHAR(64) NOT NULL COMMENT '迭代名稱',
    iteration_type VARCHAR(16) NOT NULL DEFAULT 'sprint' COMMENT '類型: sprint/version/hotfix',
    start_date DATE NOT NULL COMMENT '開始日期',
    end_date DATE NOT NULL COMMENT '結束日期',
    capacity_hours INT NOT NULL DEFAULT 0 COMMENT '產能（工時）',
    owner_user_id BIGINT DEFAULT NULL COMMENT '迭代負責人ID',
    owner_name VARCHAR(64) DEFAULT NULL COMMENT '迭代負責人姓名',
    status VARCHAR(16) NOT NULL DEFAULT 'planning' COMMENT '狀態: planning/active/closed',
    remark VARCHAR(500) DEFAULT NULL COMMENT '說明',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_iteration_code (code),
    KEY idx_rdm_iteration_status (status, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-迭代/版本排期';

-- ── 4. L3 执行任务与工时（UI设计/前端/后端/测试/数据） ──
CREATE TABLE IF NOT EXISTS rdm_work_task (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    task_no VARCHAR(32) NOT NULL COMMENT '任務編號 RT+YYYYMMDD+4位',
    req_id BIGINT NOT NULL COMMENT '業務需求ID（進度歸集口徑）',
    prd_id BIGINT DEFAULT NULL COMMENT '所屬 PRD',
    task_type VARCHAR(16) NOT NULL COMMENT '任務類型: design/frontend/backend/qa/data',
    title VARCHAR(200) NOT NULL COMMENT '任務標題',
    content VARCHAR(1000) DEFAULT NULL COMMENT '任務說明',
    owner_user_id BIGINT DEFAULT NULL COMMENT '負責人ID',
    owner_emp_no VARCHAR(32) DEFAULT NULL COMMENT '負責人工號快照',
    owner_name VARCHAR(64) DEFAULT NULL COMMENT '負責人姓名',
    role_code VARCHAR(32) DEFAULT NULL COMMENT '負責人角色（DESIGNER/DEV/QA…）',
    status VARCHAR(16) NOT NULL DEFAULT 'todo' COMMENT '狀態: todo/doing/done/blocked/cancelled',
    progress INT NOT NULL DEFAULT 0 COMMENT '進度百分比',
    plan_hours DECIMAL(6,1) DEFAULT NULL COMMENT '計劃工時',
    actual_hours DECIMAL(6,1) DEFAULT NULL COMMENT '實際工時',
    plan_start_date DATE DEFAULT NULL COMMENT '計劃開始',
    plan_finish_date DATE DEFAULT NULL COMMENT '計劃完成',
    actual_start_time DATETIME DEFAULT NULL COMMENT '實際開始',
    actual_finish_time DATETIME DEFAULT NULL COMMENT '實際完成',
    blocked_reason VARCHAR(500) DEFAULT NULL COMMENT '阻塞原因',
    iteration_code VARCHAR(32) DEFAULT NULL COMMENT '所屬迭代編碼',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_task_no (task_no),
    KEY idx_rdm_task_req (req_id, status),
    KEY idx_rdm_task_owner (owner_user_id, status),
    KEY idx_rdm_task_iteration (iteration_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-执行任务与工时（L3）';

-- ── 5. 需求变更申请（走 OA 审批，避免口头改需求导致返工无从追责） ──
CREATE TABLE IF NOT EXISTS rdm_change_request (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    change_no VARCHAR(32) NOT NULL COMMENT '變更編號 XC+YYYYMMDD+4位',
    req_id BIGINT NOT NULL COMMENT '業務需求ID',
    prd_id BIGINT DEFAULT NULL COMMENT '受影響 PRD',
    change_type VARCHAR(24) NOT NULL COMMENT '變更類型: scope/schedule/criterion/priority/other',
    before_snapshot TEXT COMMENT '變更前快照（JSON）',
    after_content VARCHAR(2000) NOT NULL COMMENT '變更後內容',
    reason VARCHAR(1000) NOT NULL COMMENT '變更原因',
    impact_desc VARCHAR(1000) DEFAULT NULL COMMENT '影響說明（工时/排期/已验收内容）',
    affects_schedule_flag TINYINT NOT NULL DEFAULT 0 COMMENT '是否影响排期',
    added_hours DECIMAL(6,1) DEFAULT NULL COMMENT '增加工时（用于返工与产能复盘）',
    flow_no VARCHAR(64) DEFAULT NULL COMMENT '關聯 OA 審批流程編號',
    approval_status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '審批狀態: pending/approved/rejected/cancelled',
    applicant_user_id BIGINT DEFAULT NULL COMMENT '申請人ID',
    applicant_name VARCHAR(64) DEFAULT NULL COMMENT '申請人姓名',
    apply_time DATETIME DEFAULT NULL COMMENT '申請時間',
    decide_time DATETIME DEFAULT NULL COMMENT '審批時間',
    decide_remark VARCHAR(500) DEFAULT NULL COMMENT '審批意見',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_change_no (change_no),
    KEY idx_rdm_change_req (req_id, approval_status),
    KEY idx_rdm_change_flow (flow_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-需求变更申请（走OA审批）';

-- ── 6. 编号规则 ──
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) VALUES
  ('rdm_prd','PRD 編號','產研協同','PRD','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號'),
  ('rdm_review','需求評審編號','產研協同','RV','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號'),
  ('rdm_work_task','研發任務編號','產研協同','RT','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號'),
  ('rdm_change','需求變更編號','產研協同','XC','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號');

-- ── 7. 需求变更审批流程（复用 OA 引擎；节点与审批人由「審批流程配置」维护） ──
INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, workflow_type, sort_order, status)
VALUES ('rdm_change','需求變更審批','general','NodeIndexOutlined','已受理需求的范围/排期/验收标准变更，需产品与研发共同确认后再执行，避免口头改需求','rdm_change',31,1);

INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description)
VALUES ('rdm_change','需求變更審批',1,'需求变更审批：控制谁能改已受理需求的范围与排期');
