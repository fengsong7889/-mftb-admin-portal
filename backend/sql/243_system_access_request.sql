-- 243: 系統權限申請（企業門戶「我要申請」）—— 建表 + 编号规则 + OA 流程定义/配置种子
--      一次性参考文档；实际执行与幂等由 SystemAccessSchemaInitializer（版本键 oa:system-access:v1.0，@Order 32）负责。
--      方言：MySQL 8.x。禁止整脚本重放（INSERT IGNORE 幂等，但本文件不进镜像、不由框架执行）。
--
-- 业务口径（用户确认）：
--   1. 门户未授权系统卡片点「我要申請」→ 填写申请页（勾选需要的菜单功能 + 说明 + 凭证）→ 发起 OA 流程；
--   2. 流程编号 XTSQ + YYYYMMDD + 2 位日流水，每日从 01 起，超 99 自然扩位，不截断、不循环复用；
--      该规则必须登记在 sys_biz_seq_rule，才能出现在平台支撐系統「編號生成規則」页供后续追溯；
--   3. 审批人在流程上直接指定「授权角色」（只支持角色：用户只属于一个部门，改 department_id 等同调岗，
--      会连带影响人事/考勤/数据范围归属，故不做部门授权）；角色持有哪些权限仍在权限管理系统配置；
--   4. 全部节点通过 → 把该角色绑定到申请人 sys_user.function_roles，并递增全局权限 revision，权限立即生效；
--   5. 审批链默认降级为单节点「主管審批」（流程配置节点留空），管理员可在「流程配置」随时编排。

-- ── 1. 申请单表 ──────────────────────────────────────────────────────────
--      OA 流程实例（biz_oa_request）承载审批流转事实，本表承载申请业务事实 + 授权兑现结果，
--      两者用 flow_no 一对一绑定；凭证/勾选菜单存 MEDIUMTEXT（base64 单件上限 2MB，TEXT 会静默截断）。
CREATE TABLE IF NOT EXISTS biz_system_access_request (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    flow_no           VARCHAR(64)  NOT NULL COMMENT 'OA流程编号(XTSQ+YYYYMMDD+2位日流水)',
    system_code       VARCHAR(32)  NOT NULL COMMENT '申请的业务系统编码 sys_system.code',
    system_name       VARCHAR(64)  DEFAULT NULL COMMENT '系统名称快照',
    user_id           BIGINT       NOT NULL COMMENT '申请人 sys_user.id',
    applicant_name    VARCHAR(64)  NOT NULL COMMENT '申请人姓名快照',
    applicant_emp_id  VARCHAR(32)  DEFAULT NULL COMMENT '申请人工号快照',
    dept_name         VARCHAR(128) DEFAULT NULL COMMENT '申请人部门名称快照',
    requested_menus   MEDIUMTEXT   COMMENT '申请的菜单功能JSON [{menuKey,name}]',
    reason            VARCHAR(1000) NOT NULL COMMENT '申请说明',
    attachments       MEDIUMTEXT   COMMENT '相关凭证JSON [{name,type,size,contentType,dataUrl}]',
    status            VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT '状态: pending/approved/rejected/cancelled',
    grant_target_type VARCHAR(16)  DEFAULT NULL COMMENT '授权对象类型: role',
    grant_target_id   BIGINT       DEFAULT NULL COMMENT '授权角色 sys_role.id',
    grant_target_name VARCHAR(64)  DEFAULT NULL COMMENT '授权角色名称快照',
    grant_status      VARCHAR(16)  NOT NULL DEFAULT 'none' COMMENT '授权兑现状态: none/granted（granted 是幂等闸门；兑现与审批同事务，失败整体回滚不留中间态）',
    granted_at        DATETIME     DEFAULT NULL COMMENT '授权兑现时间',
    granted_by        VARCHAR(64)  DEFAULT NULL COMMENT '兑现时的审批人签名',
    reject_reason     VARCHAR(500) DEFAULT NULL COMMENT '驳回理由',
    apply_time        DATETIME     DEFAULT NULL COMMENT '申请时间',
    complete_time     DATETIME     DEFAULT NULL COMMENT '审结时间',
    created_by        VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    updated_by        VARCHAR(64)  DEFAULT NULL COMMENT '最后更新人',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted           TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    UNIQUE KEY uk_sar_flow_no (flow_no),
    KEY idx_sar_user (user_id, status),
    KEY idx_sar_system (system_code, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='系統權限申請單（門戶我要申請→OA審批→綁定授權角色）';

-- ── 2. 编号规则种子（幂等）───────────────────────────────────────────────
--      rule_key 与 BizSeqService.RULE_SYSTEM_ACCESS_REQUEST 一致；
--      seq_length=2 是最少位数（BizSeqService 用 %02d 格式化，超过 99 自然扩位为 100/101…）；
--      seq_start=1 表示每日首号为 01（seq_start=0 才会从 00 起）。
--      缺行/停用时 OaRequestServiceImpl.submit() 对 system_access 直接报「編號生成規則未配置」而拒绝提交，
--      不回落通用 OA 号 —— 宁可不给提交，也不能让审批单和「編號生成規則」页对不上。
INSERT IGNORE INTO sys_biz_seq_rule
    (rule_key, rule_name, biz_menu, prefix, date_format, seq_length, seq_start, status, remark)
VALUES
    ('system_access_request', '系統權限申請流程編號', '流程審批系統－系統權限申請', 'XTSQ', 'YYYYMMDD', 2, 1, 1,
     '{prefix} + YYYYMMDD + 至少2位自增序號：每日從 01 起，超過 99 自然擴位為 100，不截斷、不循環複用。生成時機：員工在企業門戶對未授權系統點「我要申請」並正式提交時生成；審批人未配置授權角色時不發號（提交即失敗），撤銷/駁回的單號不回收。');

-- ── 3. OA 流程定义（流程中心/流程事项据此识别类型）─────────────────────────
INSERT IGNORE INTO biz_oa_process
    (process_code, process_name, category, icon, description, workflow_type, sort_order, status)
VALUES
    ('system_access', '系統權限申請', 'general', 'SafetyCertificateOutlined',
     '申請未授權業務系統的使用權限：勾選需要的菜單功能並說明用途，審批人指定授權角色，通過後自動綁定並立即生效',
     'system_access', 40, 1);

-- ── 4. 流程配置行（节点与路由规则留空 → 引擎降级为「主管審批」单节点，管理页可随时配细）──
INSERT IGNORE INTO biz_workflow_config (flow_type, flow_name, approval_enabled, description)
VALUES ('system_access', '系統權限申請審批', 1,
        '系統權限申請審批：控制誰來審、審批人在流程上指定要綁定的授權角色');

-- ── 5. 回滚口径 ─────────────────────────────────────────────────────────
--      本迁移只 ADD/INSERT IGNORE，不含破坏性操作。需要停用本流程时：
--        UPDATE biz_oa_process SET status = 0 WHERE process_code = 'system_access';
--        UPDATE sys_biz_seq_rule SET status = 0 WHERE rule_key = 'system_access_request';
--      停用后提交立即 fail-closed（流程类型不存在/编号规则未配置），存量单据与已兑现的角色绑定不受影响；
--      已绑定的角色按 sys_permission_audit 里 CHANGE_BIND 记录（含 flowNo）人工回收。
