-- 204: 產研協同（RDM）需求全生命周期 M1 核心表
--      一次性参考文档；实际执行与幂等由 RdmSchemaMigrationInitializer 负责。
--      版本键: rdm:schema:v1.0（建表 + 状态机/流转/SLA 种子 + 编号规则 + 准入流程定义）
--      方言：MySQL 8.x，全部 CREATE TABLE IF NOT EXISTS / INSERT IGNORE，可重复执行。
--      状态机真值：rdm_status_def + rdm_transition（前端操作区由流转规则驱动，不在代码里硬编码）
--      度量真值：rdm_status_log.duration_seconds（周期/逾期/瓶颈分析唯一来源，禁止事后补算）

-- ── 1. 需求主表（L1 业务需求单据） ──
CREATE TABLE IF NOT EXISTS rdm_requirement (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_no VARCHAR(32) NOT NULL COMMENT '需求编号 XQ+YYYYMMDD+4位',
    title VARCHAR(200) NOT NULL COMMENT '需求标题',
    req_type VARCHAR(32) NOT NULL COMMENT '需求类型: NEW_MENU/NEW_FEATURE/OPTIMIZE/BUG/DATA/POLICY/INTEGRATION/OTHER',
    priority VARCHAR(16) NOT NULL DEFAULT 'P2' COMMENT '优先级: P0/P1/P2/P3',
    complexity VARCHAR(16) DEFAULT NULL COMMENT '规模: SIMPLE/MEDIUM/COMPLEX/HUGE（产品评估后回填）',
    description TEXT COMMENT '现状与痛点',
    expect_result TEXT COMMENT '期望结果（验收检查项来源）',
    business_value VARCHAR(1000) COMMENT '业务价值',
    expect_date DATE DEFAULT NULL COMMENT '业务期望完成日期',
    submitter_user_id BIGINT NOT NULL COMMENT '提出人 sys_user.id',
    submitter_emp_no VARCHAR(32) DEFAULT NULL COMMENT '提出人工号快照',
    submitter_name VARCHAR(64) NOT NULL COMMENT '提出人姓名快照',
    submit_dept_id BIGINT DEFAULT NULL COMMENT '提出部门ID快照',
    submit_dept_name VARCHAR(128) DEFAULT NULL COMMENT '提出部门名称快照',
    submit_time DATETIME DEFAULT NULL COMMENT '提交时间（草稿为空，进入待审批时写入）',
    need_approval TINYINT NOT NULL DEFAULT 1 COMMENT '是否需要准入审批: 1=需要 0=免审（按路由规则判定）',
    intake_flow_no VARCHAR(64) DEFAULT NULL COMMENT '关联 OA 准入流程编号',
    dispatcher_user_id BIGINT DEFAULT NULL COMMENT '分发人（技术负责人）ID',
    dispatcher_name VARCHAR(64) DEFAULT NULL COMMENT '分发人姓名',
    distribute_time DATETIME DEFAULT NULL COMMENT '分配时间',
    assignee_pm_user_id BIGINT DEFAULT NULL COMMENT '产品经理 sys_user.id',
    assignee_pm_emp_no VARCHAR(32) DEFAULT NULL COMMENT '产品经理工号快照',
    assignee_pm_name VARCHAR(64) DEFAULT NULL COMMENT '产品经理姓名快照',
    accept_time DATETIME DEFAULT NULL COMMENT '产品受理时间',
    promised_prd_date DATE DEFAULT NULL COMMENT '承诺出 PRD 日期',
    dev_owner_user_id BIGINT DEFAULT NULL COMMENT '研发负责人ID',
    dev_owner_name VARCHAR(64) DEFAULT NULL COMMENT '研发负责人姓名',
    iteration_code VARCHAR(32) DEFAULT NULL COMMENT '迭代/版本排期标识',
    plan_dev_date DATE DEFAULT NULL COMMENT '计划开发完成日期',
    plan_release_date DATE DEFAULT NULL COMMENT '计划上线日期',
    actual_release_date DATE DEFAULT NULL COMMENT '实际上线日期',
    version_no VARCHAR(32) DEFAULT NULL COMMENT '关联发布版本 sys_version_history.version_no',
    status VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT '当前状态（见 rdm_status_def）',
    status_enter_time DATETIME DEFAULT NULL COMMENT '进入当前状态时间（停留时长计算基准）',
    progress INT NOT NULL DEFAULT 0 COMMENT '研发进度百分比 0-100',
    blocked_flag TINYINT NOT NULL DEFAULT 0 COMMENT '是否阻塞: 1=阻塞中',
    blocked_reason VARCHAR(500) DEFAULT NULL COMMENT '阻塞原因与依赖方',
    overdue_flag TINYINT NOT NULL DEFAULT 0 COMMENT '是否逾期（SLA 扫描写入）',
    on_hold_until DATE DEFAULT NULL COMMENT '挂起复审日期',
    reject_reason VARCHAR(500) DEFAULT NULL COMMENT '最近一次驳回理由',
    reject_count INT NOT NULL DEFAULT 0 COMMENT '累计驳回次数（准入驳回+产品驳回+验收退回）',
    reopen_count INT NOT NULL DEFAULT 0 COMMENT '重开次数',
    rework_count INT NOT NULL DEFAULT 0 COMMENT '验收退回返工次数',
    change_count INT NOT NULL DEFAULT 0 COMMENT '需求变更次数',
    acceptor_user_id BIGINT DEFAULT NULL COMMENT '业务验收人ID',
    acceptor_name VARCHAR(64) DEFAULT NULL COMMENT '业务验收人姓名',
    acceptance_result VARCHAR(16) DEFAULT NULL COMMENT '验收结论: pass/conditional/fail',
    acceptance_score TINYINT DEFAULT NULL COMMENT '交付满意度 1-5',
    acceptance_time DATETIME DEFAULT NULL COMMENT '验收时间',
    current_handler_name VARCHAR(64) DEFAULT NULL COMMENT '当前处理人（列表/待办展示与筛选冗余）',
    source_channel VARCHAR(16) NOT NULL DEFAULT 'WEB' COMMENT '来源渠道: WEB/MOBILE/DINGTALK/AI',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_req_no (req_no),
    KEY idx_rdm_req_status (status, plan_release_date),
    KEY idx_rdm_req_submitter (submitter_user_id, status),
    KEY idx_rdm_req_pm (assignee_pm_user_id, status),
    KEY idx_rdm_req_dept (submit_dept_id, status),
    KEY idx_rdm_req_flow (intake_flow_no),
    KEY idx_rdm_req_submit (submit_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-业务需求主表（需求全生命周期单据）';

-- ── 2. 需求关联对象（定位到系统/菜单/页面/功能点） ──
CREATE TABLE IF NOT EXISTS rdm_requirement_target (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT NOT NULL COMMENT '需求ID rdm_requirement.id',
    system_code VARCHAR(32) DEFAULT NULL COMMENT '业务系统编码 sys_system.code',
    system_name VARCHAR(64) DEFAULT NULL COMMENT '系统名称快照',
    menu_key VARCHAR(64) DEFAULT NULL COMMENT '菜单标识 sys_menu.menu_key',
    menu_name VARCHAR(64) DEFAULT NULL COMMENT '菜单名称快照',
    page_path VARCHAR(128) DEFAULT NULL COMMENT '页面路由路径',
    anchor_type VARCHAR(32) NOT NULL DEFAULT 'NONE' COMMENT '定位粒度: NONE/SYSTEM/MENU/PAGE/FUNCTION/FIELD/BUTTON/REPORT',
    anchor_name VARCHAR(128) DEFAULT NULL COMMENT '定位对象名称（按钮/字段/功能点名）',
    anchor_desc VARCHAR(1000) DEFAULT NULL COMMENT '定位补充说明',
    screenshot_path VARCHAR(500) DEFAULT NULL COMMENT '现状截图存储路径或 data URL',
    annotation_json TEXT COMMENT '圈选标注数据 JSON',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_rdm_target_req (req_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-需求关联对象（改现有菜单/功能时精确定位）';

-- ── 3. 工作项成员与角色 ──
CREATE TABLE IF NOT EXISTS rdm_requirement_role (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT NOT NULL COMMENT '需求ID',
    user_id BIGINT NOT NULL COMMENT '成员 sys_user.id',
    emp_no VARCHAR(32) DEFAULT NULL COMMENT '工号快照',
    emp_name VARCHAR(64) NOT NULL COMMENT '姓名快照',
    role_code VARCHAR(32) NOT NULL COMMENT '角色: SUBMITTER/DEPT_LEADER/APPROVER/DISPATCHER/PM/PMO/DEV_LEAD/DEV/DESIGNER/QA/ACCEPTOR/CC',
    is_active TINYINT NOT NULL DEFAULT 1 COMMENT '是否有效参与人',
    join_time DATETIME DEFAULT NULL COMMENT '加入时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_role (req_id, user_id, role_code),
    KEY idx_rdm_role_user (user_id, role_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-需求参与角色（同一需求多人多角色）';

-- ── 4. 状态流转流水（度量与逾期的唯一真值） ──
CREATE TABLE IF NOT EXISTS rdm_status_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT NOT NULL COMMENT '需求ID',
    from_status VARCHAR(32) DEFAULT NULL COMMENT '变更前状态',
    to_status VARCHAR(32) NOT NULL COMMENT '变更后状态',
    action_code VARCHAR(32) DEFAULT NULL COMMENT '触发动作（见 rdm_transition）',
    operator_user_id BIGINT DEFAULT NULL COMMENT '操作人ID（姓名可重名，追责靠ID）',
    operator_name VARCHAR(64) DEFAULT NULL COMMENT '操作人姓名快照',
    operator_role VARCHAR(32) DEFAULT NULL COMMENT '操作人当时角色',
    remark VARCHAR(1000) DEFAULT NULL COMMENT '说明/理由',
    enter_time DATETIME NOT NULL COMMENT '进入 to_status 时间',
    leave_time DATETIME DEFAULT NULL COMMENT '离开 to_status 时间（下一条流水写入时回填）',
    duration_seconds BIGINT DEFAULT NULL COMMENT '在 to_status 停留秒数（离开时回填）',
    is_overdue TINYINT NOT NULL DEFAULT 0 COMMENT '该状态是否逾期离开',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_rdm_log_req (req_id, enter_time),
    KEY idx_rdm_log_status (to_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-状态流转流水（周期/瓶颈/逾期分析唯一数据源）';

-- ── 5. 沟通评论 ──
CREATE TABLE IF NOT EXISTS rdm_comment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT NOT NULL COMMENT '需求ID',
    parent_id BIGINT DEFAULT NULL COMMENT '父评论ID（回复）',
    content TEXT NOT NULL COMMENT '评论内容',
    mention_user_ids VARCHAR(500) DEFAULT NULL COMMENT '@ 提醒的用户ID列表',
    internal_flag TINYINT NOT NULL DEFAULT 0 COMMENT '仅产研可见: 1=业务方不可见',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_rdm_comment_req (req_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-需求沟通记录';

-- ── 6. 附件 ──
CREATE TABLE IF NOT EXISTS rdm_attachment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT NOT NULL COMMENT '需求ID',
    biz_type VARCHAR(16) NOT NULL DEFAULT 'REQ' COMMENT '业务类型: REQ/COMMENT/ACCEPT/CHANGE',
    file_name VARCHAR(200) NOT NULL COMMENT '文件名',
    storage_path VARCHAR(500) DEFAULT NULL COMMENT '存储路径',
    file_type VARCHAR(64) DEFAULT NULL COMMENT 'MIME 类型',
    file_size BIGINT DEFAULT NULL COMMENT '字节数',
    uploader_user_id BIGINT DEFAULT NULL COMMENT '上传人ID',
    uploader_name VARCHAR(64) DEFAULT NULL COMMENT '上传人姓名',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_rdm_att_req (req_id, biz_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-需求附件（截图/文档/原型）';

-- ── 7. 业务验收单 ──
CREATE TABLE IF NOT EXISTS rdm_acceptance (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    accept_no VARCHAR(32) NOT NULL COMMENT '验收单号 XQYS+YYYYMMDD+4位',
    req_id BIGINT NOT NULL COMMENT '需求ID',
    acceptor_user_id BIGINT DEFAULT NULL COMMENT '验收人ID',
    acceptor_emp_no VARCHAR(32) DEFAULT NULL COMMENT '验收人工号快照',
    acceptor_name VARCHAR(64) DEFAULT NULL COMMENT '验收人姓名快照',
    result VARCHAR(16) NOT NULL COMMENT '结论: pass/conditional/fail',
    score TINYINT DEFAULT NULL COMMENT '交付满意度 1-5',
    case_total INT DEFAULT NULL COMMENT '验收用例总数',
    case_pass INT DEFAULT NULL COMMENT '通过用例数',
    issues VARCHAR(1000) DEFAULT NULL COMMENT '问题/遗留事项（不通过或有条件通过必填）',
    opinion VARCHAR(1000) DEFAULT NULL COMMENT '验收意见',
    accept_time DATETIME DEFAULT NULL COMMENT '验收时间',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_accept_no (accept_no),
    KEY idx_rdm_accept_req (req_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-业务验收单（需求闭环最后一道闸）';

-- ── 8. 状态定义（配置化状态机） ──
CREATE TABLE IF NOT EXISTS rdm_status_def (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    code VARCHAR(32) NOT NULL COMMENT '状态编码',
    label VARCHAR(64) NOT NULL COMMENT '状态名称',
    stage VARCHAR(32) NOT NULL COMMENT '所属阶段: submit/intake/dispatch/product/delivery/acceptance',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
    final_flag TINYINT NOT NULL DEFAULT 0 COMMENT '是否终态',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '启用: 1=启用 0=停用',
    remark VARCHAR(255) DEFAULT NULL COMMENT '说明',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_status_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-状态定义';

-- ── 9. 流转规则（谁能推进 + 必填什么） ──
CREATE TABLE IF NOT EXISTS rdm_transition (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    from_status VARCHAR(32) NOT NULL COMMENT '起始状态',
    to_status VARCHAR(32) NOT NULL COMMENT '目标状态',
    action_code VARCHAR(32) NOT NULL COMMENT '动作编码',
    action_name VARCHAR(64) NOT NULL COMMENT '动作名称（按钮文案）',
    allowed_roles VARCHAR(255) NOT NULL COMMENT '允许角色编码，逗号分隔',
    required_fields VARCHAR(255) DEFAULT NULL COMMENT '必填字段，逗号分隔（remark/planDate/promisedDate/versionNo/score/pm/holdUntil）',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '启用: 1=启用 0=停用（停用后详情页按钮消失，无需发版）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_trans (from_status, action_code),
    KEY idx_rdm_trans_from (from_status, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-状态流转规则';

-- ── 10. 分发矩阵（业务域/菜单/部门/类型 → 默认产品经理） ──
CREATE TABLE IF NOT EXISTS rdm_routing_rule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    scope_type VARCHAR(16) NOT NULL COMMENT '匹配范围: SYSTEM/MENU/DEPT/TYPE',
    scope_value VARCHAR(64) NOT NULL COMMENT '范围取值（系统编码/菜单key/部门ID/需求类型）',
    scope_name VARCHAR(128) NOT NULL COMMENT '范围名称快照（展示用）',
    pm_user_id BIGINT NOT NULL COMMENT '负责产品经理 sys_user.id',
    pm_name VARCHAR(64) NOT NULL COMMENT '产品经理姓名快照',
    backup_pm_user_id BIGINT DEFAULT NULL COMMENT '备用产品经理ID',
    backup_pm_name VARCHAR(64) DEFAULT NULL COMMENT '备用产品经理姓名',
    load_capacity INT NOT NULL DEFAULT 8 COMMENT '在途需求容量上限',
    priority INT NOT NULL DEFAULT 0 COMMENT '命中优先级（越小越优先）',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '启用: 1=启用 0=停用',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_routing (scope_type, scope_value, pm_user_id),
    KEY idx_rdm_routing_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-分发矩阵（自动推荐对口产品经理）';

-- ── 11. SLA 与逾期规则 ──
CREATE TABLE IF NOT EXISTS rdm_sla_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    status_code VARCHAR(32) NOT NULL COMMENT '环节状态编码',
    priority VARCHAR(16) NOT NULL DEFAULT '' COMMENT '适用优先级，空=全部',
    sla_hours INT NOT NULL COMMENT '标准时效（小时）',
    warn_hours INT NOT NULL COMMENT '预警阈值（小时）',
    escalate_role VARCHAR(32) NOT NULL DEFAULT 'PM' COMMENT '逾期升级通知角色',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '启用: 1=启用 0=停用',
    created_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_rdm_sla (status_code, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-SLA 时效与逾期升级配置';

-- ── 12. 通知留痕 ──
CREATE TABLE IF NOT EXISTS rdm_notify_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    req_id BIGINT DEFAULT NULL COMMENT '需求ID',
    event_code VARCHAR(32) NOT NULL COMMENT '事件编码（见 RdmConstants.EVENT_*）',
    channel VARCHAR(16) NOT NULL DEFAULT 'DINGTALK' COMMENT '渠道: DINGTALK/INBOX',
    receiver_name VARCHAR(64) DEFAULT NULL COMMENT '接收人姓名',
    receiver_emp_no VARCHAR(32) DEFAULT NULL COMMENT '接收人工号',
    send_status VARCHAR(16) NOT NULL COMMENT '结果: success/skipped/failed',
    error_msg VARCHAR(500) DEFAULT NULL COMMENT '失败原因',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    KEY idx_rdm_notify_req (req_id, event_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RDM-通知发送留痕（可排查漏通知/重发）';

-- ── 13. 编号规则 ──
INSERT IGNORE INTO sys_biz_seq_rule (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark) VALUES
  ('rdm_requirement','需求編號','產研協同','XQ','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號'),
  ('rdm_acceptance','需求驗收單號','產研協同','XQYS','YYYYMMDD',4,1,1,'{prefix} + YYYYMMDD + {n}位自增序號');

-- ── 14. 准入审批流程定义（复用 OA 引擎：节点/审批人由「審批流程配置」维护） ──
INSERT IGNORE INTO biz_oa_process (process_code, process_name, category, icon, description, workflow_type, sort_order, status)
VALUES ('rdm_intake','需求准入審批','general','ProjectOutlined','業務提交的產研需求進入需求池前的准入審批，可按部門/優先級配置是否需要上級或指定人審批','rdm_intake',30,1);

-- 流程配置行（节点与路由规则留空→引擎降级为「主管審批」单节点，管理页可随时配细）
INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description)
VALUES ('rdm_intake','需求准入審批',1,'業務需求准入：控制哪些部门/人提的需求需要上級或指定人審批後才送達技術部');

-- ── 15. 状态机与 SLA 默认配置（幂等种子；调整走「需求配置」界面） ──
INSERT IGNORE INTO rdm_status_def (code, label, stage, sort_order, final_flag, status) VALUES
  ('draft','草稿','submit',1,0,1),
  ('intake_pending','待審批','intake',2,0,1),
  ('intake_rejected','審批駁回','intake',3,0,1),
  ('pool','需求池·待分配','dispatch',4,0,1),
  ('assigned','已分配·待受理','dispatch',5,0,1),
  ('evaluating','評估中','dispatch',6,0,1),
  ('rejected','已駁回','dispatch',7,0,1),
  ('on_hold','挂起暂缓','dispatch',8,0,1),
  ('accepted','已受理·待排期','product',9,0,1),
  ('prd_designing','PRD設計中','product',10,0,1),
  ('reviewing','評審中','product',11,0,1),
  ('review_passed','評審通過','product',12,0,1),
  ('scheduled','已排期','delivery',13,0,1),
  ('designing','UI設計中','delivery',14,0,1),
  ('developing','開發中','delivery',15,0,1),
  ('integration','聯調中','delivery',16,0,1),
  ('testing','測試中','delivery',17,0,1),
  ('test_passed','測試通過','delivery',18,0,1),
  ('uat_pending','待業務驗收','acceptance',19,0,1),
  ('uat_rejected','驗收未通過','acceptance',20,0,1),
  ('released','已上線','acceptance',21,0,1),
  ('verified','已確認交付','acceptance',22,0,1),
  ('closed','已歸檔','acceptance',23,1,1);

INSERT IGNORE INTO rdm_transition (from_status, to_status, action_code, action_name, allowed_roles, required_fields, sort_order, status) VALUES
  ('draft','intake_pending','submit','提交需求','SUBMITTER','',1,1),
  ('draft','pool','submit_pool','免審批直送需求池','SUBMITTER','',2,1),
  ('intake_pending','draft','withdraw','撤回修改','SUBMITTER','',3,1),
  ('intake_pending','pool','approve_intake','審批通過','APPROVER,DEPT_LEADER','',4,1),
  ('intake_pending','intake_rejected','reject_intake','審批駁回','APPROVER,DEPT_LEADER','remark',5,1),
  ('intake_rejected','intake_pending','resubmit','修改後重提','SUBMITTER','',6,1),
  ('pool','assigned','dispatch','分配產品經理','DISPATCHER','pm',7,1),
  ('assigned','evaluating','start_evaluate','開始評估','PM','',8,1),
  ('assigned','pool','reassign','退回需求池','DISPATCHER,PM','remark',9,1),
  ('evaluating','accepted','accept','接受需求','PM','promisedDate',10,1),
  ('evaluating','rejected','reject','駁回需求','PM','remark',11,1),
  ('evaluating','on_hold','hold','挂起暂缓','PM','remark',12,1),
  ('on_hold','evaluating','unhold','恢復推進','PM','',13,1),
  ('accepted','prd_designing','prd_start','開始寫 PRD','PM','',14,1),
  ('prd_designing','reviewing','review_start','發起評審','PM','',15,1),
  ('reviewing','review_passed','review_pass','評審通過','DEV_LEAD,QA,DESIGNER','',16,1),
  ('reviewing','prd_designing','review_reject','評審退回','DEV_LEAD','remark',17,1),
  ('review_passed','scheduled','schedule','提交排期','PM,DEV_LEAD,PMO','planDate',18,1),
  ('scheduled','designing','design_start','開始 UI 設計','DESIGNER,PM','',19,1),
  ('designing','developing','design_done','UI 完成轉開發','DESIGNER,DEV','',20,1),
  ('scheduled','developing','dev_start','開始開發','DEV,DEV_LEAD,PM','',21,1),
  ('designing','developing','dev_start','開始開發','DEV,DEV_LEAD,PM','',22,1),
  ('developing','testing','dev_done','開發完成轉測試','DEV,DEV_LEAD','',23,1),
  ('testing','uat_pending','submit_uat','測試通過轉驗收','QA,PM','',24,1),
  ('testing','developing','test_reject','測試退回開發','QA','remark',25,1),
  ('uat_pending','released','release','確認上線','PM,DEV_LEAD','versionNo',26,1),
  ('uat_pending','developing','uat_fail','驗收退回開發','ACCEPTOR,PM','remark',27,1),
  ('released','verified','verify','業務確認交付','ACCEPTOR','score',28,1),
  ('verified','closed','close','歸檔關閉','PMO,PM','',29,1),
  ('rejected','intake_pending','reopen','重新打開','SUBMITTER,PMO,DISPATCHER','remark',30,1),
  ('intake_rejected','intake_pending','reopen','重新打開','SUBMITTER,PMO','remark',31,1),
  ('closed','developing','reopen','重新打開','PMO','remark',32,1);

INSERT IGNORE INTO rdm_sla_config (status_code, priority, sla_hours, warn_hours, escalate_role, status) VALUES
  ('intake_pending','',24,20,'DEPT_LEADER',1),
  ('pool','',48,40,'DISPATCHER',1),
  ('assigned','',24,18,'PM',1),
  ('evaluating','',72,60,'PM',1),
  ('accepted','',120,96,'PM',1),
  ('developing','P0',24,18,'DEV_LEAD',1),
  ('developing','P1',120,96,'DEV_LEAD',1),
  ('developing','P2',240,192,'DEV_LEAD',1),
  ('testing','',48,36,'QA',1),
  ('uat_pending','',72,60,'ACCEPTOR',1);
