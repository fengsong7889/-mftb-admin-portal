-- ============================================================
-- MFTB 搜广推系统 - 财务管理模块
-- 数据库: MySQL 8.0+
-- 覆盖模块: 推广金账户 / 审批流程 / 批次 / 交易明细 / 欠款单 / 还款明细 / 业务编号序号
-- 注意: 使用 CREATE TABLE IF NOT EXISTS，幂等可重复执行
-- 说明: 空库起步，业务数据全部由界面操作（申请 -> 三级审批通过）产生
-- ============================================================

USE mftb_admin;

-- ============================================================
-- 一、推广金账户表（集团维度一行）
-- 对应前端「账户余额」菜单
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_fin_account (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    group_code      VARCHAR(32)   NOT NULL                   COMMENT '集团ID (关联 biz_merchant_group.group_code)',
    group_name      VARCHAR(128)  NOT NULL                   COMMENT '集团名称快照',
    brand           VARCHAR(64)                              COMMENT '所属品牌: flashBee=闪蜂 / mFood',
    virtual_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00      COMMENT '虚拟账户余额',
    actual_balance  DECIMAL(14,2) NOT NULL DEFAULT 0.00      COMMENT '实收账户余额',
    status          VARCHAR(16)   NOT NULL DEFAULT 'normal'  COMMENT '账户状态: normal=正常 frozen=已冻结 mergeFrozen=合并冻结 cancelled=已注销',
    updated_by      VARCHAR(64)                              COMMENT '最后更新人',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除: 0=未删除 1=已删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_fin_account_group (group_code),
    KEY idx_fin_account_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广金账户表';

-- ============================================================
-- 二、财务审批流程表
-- 对应前端「审批中心」菜单，三级审批: 业务主管 -> 运营主管 -> 财务主管
-- 财务主管通过后由后端事务写入批次/明细/欠款单并变更账户余额
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_fin_approval (
    id                 BIGINT       PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    flow_no            VARCHAR(32)  NOT NULL                   COMMENT '流程编号: CZ=充值 KK=扣款 ZZ=转账 HB=合并 + 年月日 + 4位自增',
    approval_type      VARCHAR(16)  NOT NULL                   COMMENT '审批类型: recharge/transfer/deduct/merge',
    group_code         VARCHAR(32)  NOT NULL                   COMMENT '申请集团ID',
    group_name         VARCHAR(128) NOT NULL                   COMMENT '申请集团名称',
    brand              VARCHAR(64)                             COMMENT '所属品牌',
    applicant          VARCHAR(64)                             COMMENT '申请人: 姓名(工号)',
    apply_time         DATETIME                                COMMENT '申请时间',
    biz_approver       VARCHAR(64)                             COMMENT '业务主管审批人',
    biz_approve_time   DATETIME                                COMMENT '业务主管审批时间',
    biz_approve_status VARCHAR(16)  DEFAULT 'pending'          COMMENT '业务主管审批状态: pending/approved/rejected',
    ops_approver       VARCHAR(64)                             COMMENT '运营主管审批人',
    ops_approve_time   DATETIME                                COMMENT '运营主管审批时间',
    ops_approve_status VARCHAR(16)  DEFAULT 'pending'          COMMENT '运营主管审批状态: pending/approved/rejected',
    fin_approver       VARCHAR(64)                             COMMENT '财务主管审批人',
    fin_approve_time   DATETIME                                COMMENT '财务主管审批时间',
    fin_approve_status VARCHAR(16)  DEFAULT 'pending'          COMMENT '财务主管审批状态: pending/approved/rejected',
    flow_status        VARCHAR(16)  DEFAULT 'pending'          COMMENT '流程状态: pending=审批中 approved=已通过 rejected=已驳回 cancelled=已撤销',
    reject_reason      VARCHAR(500)                            COMMENT '驳回理由',
    extra              JSON                                    COMMENT '申请表单扩展数据(结算方式/扣款门店/对方集团/偿还门店等)',
    updated_by         VARCHAR(64)                             COMMENT '最后更新人',
    deleted            TINYINT      DEFAULT 0                  COMMENT '逻辑删除',
    created_at         DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at         DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_fin_approval_flow (flow_no),
    KEY idx_fin_approval_group (group_code),
    KEY idx_fin_approval_status (flow_status),
    KEY idx_fin_approval_type (approval_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='财务审批流程表';

-- ============================================================
-- 三、批次表
-- 对应前端「批次查询」菜单；仅充值/转账/合并生成批次，扣款不生成批次
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_fin_batch (
    id              BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    batch_no        VARCHAR(32)   NOT NULL                   COMMENT '批次号: PC + 年月日 + 4位自增',
    batch_type      VARCHAR(16)   NOT NULL                   COMMENT '批次类型: recharge/transfer/merge',
    flow_no         VARCHAR(32)                              COMMENT '关联流程编号',
    group_code      VARCHAR(32)   NOT NULL                   COMMENT '集团ID',
    group_name      VARCHAR(128)  NOT NULL                   COMMENT '集团名称',
    brand           VARCHAR(64)                              COMMENT '所属品牌',
    trade_time      DATETIME                                 COMMENT '交易时间(审批通过时间)',
    is_actual       VARCHAR(8)                               COMMENT '是否实收: 是/否/--',
    virtual_amount  DECIMAL(14,2)                            COMMENT '虚拟账户金额(负数=转出/扣减)',
    actual_amount   DECIMAL(14,2)                            COMMENT '实收账户金额(NULL=不涉及)',
    discount_amount DECIMAL(14,2)                            COMMENT '优惠金额',
    applicant       VARCHAR(64)                              COMMENT '申请人',
    bd              VARCHAR(64)                              COMMENT '所属BD',
    remark          VARCHAR(500)                             COMMENT '备注',
    extra           JSON                                     COMMENT '批次明细页展示数据(结算方式/扣款门店/偿还门店等)',
    deleted         TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_fin_batch_no (batch_no),
    KEY idx_fin_batch_group (group_code),
    KEY idx_fin_batch_flow (flow_no),
    KEY idx_fin_batch_time (trade_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广金批次表';

-- ============================================================
-- 四、交易明细表
-- 对应前端「明细查询」菜单，充消对账报表由本表按集团按日聚合得出
-- 实收账户变动金额按等比例规则计算: 虚拟变动 x (实收充值 / 虚拟充值)
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_fin_detail (
    id             BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    detail_id      VARCHAR(32)   NOT NULL                   COMMENT '明细ID: MX + 年月日 + 4位自增',
    group_code     VARCHAR(32)   NOT NULL                   COMMENT '集团ID',
    group_name     VARCHAR(128)  NOT NULL                   COMMENT '集团名称',
    brand          VARCHAR(64)                              COMMENT '所属品牌',
    store_code     VARCHAR(32)                              COMMENT '门店ID(集团维度记 --)',
    store_name     VARCHAR(128)                             COMMENT '门店名称',
    channel        VARCHAR(64)                              COMMENT '业务频道: 美食外卖/超市百货/团购到店',
    trade_type     VARCHAR(16)                              COMMENT '交易类型: 充值/扣款/消费/转入/转出',
    change_type    VARCHAR(64)                              COMMENT '变动类别: 充值/充值批次扣款/账户扣款/欠款偿还/转账转出/转账转入/合并转出/合并转入等',
    trade_time     DATETIME                                 COMMENT '交易时间',
    virtual_change DECIMAL(14,2) NOT NULL DEFAULT 0.00      COMMENT '虚拟账户变动金额(+增 -减)',
    actual_change  DECIMAL(14,2)                            COMMENT '实收账户变动金额(NULL=不涉及，展示 --)',
    batch_no       VARCHAR(32)                              COMMENT '关联批次号',
    flow_no        VARCHAR(32)                              COMMENT '流程编号',
    bd             VARCHAR(64)                              COMMENT '所属BD',
    remark         VARCHAR(500)                             COMMENT '备注',
    deleted        TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_fin_detail_id (detail_id),
    KEY idx_fin_detail_group_time (group_code, trade_time),
    KEY idx_fin_detail_batch (batch_no),
    KEY idx_fin_detail_flow (flow_no),
    KEY idx_fin_detail_store (store_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='推广金交易明细表';

-- ============================================================
-- 五、欠款单表
-- 对应前端「欠款对账」菜单
-- 数据来源: 充值申请(实收=混合支付/营业额支付，每个扣款门店一条) 审批通过
--          商户合并申请(存续集团每个偿还门店一条) 审批通过
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_fin_debt_bill (
    id            BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    bill_no       VARCHAR(32)   NOT NULL                   COMMENT '账单编号: QK + 年月日 + 4位自增',
    group_code    VARCHAR(32)   NOT NULL                   COMMENT '集团ID',
    group_name    VARCHAR(128)  NOT NULL                   COMMENT '集团名称',
    brand         VARCHAR(64)                              COMMENT '所属品牌',
    store_code    VARCHAR(32)                              COMMENT '门店ID',
    store_name    VARCHAR(128)                             COMMENT '门店名称',
    channel       VARCHAR(64)                              COMMENT '业务频道',
    bd            VARCHAR(64)                              COMMENT '所属BD',
    source        VARCHAR(16)   NOT NULL                   COMMENT '账单来源: recharge=充值营业额扣款 merge=合并欠款转入',
    loan_date     DATE                                     COMMENT '借款日期(审批通过日期)',
    batch_no      VARCHAR(32)                              COMMENT '关联批次号',
    flow_no       VARCHAR(32)                              COMMENT '流程编号',
    debt_total    DECIMAL(14,2) NOT NULL DEFAULT 0.00      COMMENT '欠款总额',
    paid_amount   DECIMAL(14,2) NOT NULL DEFAULT 0.00      COMMENT '已还金额(还款明细合计，含转移结算)',
    remain_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00      COMMENT '剩余待还 = 欠款总额 - 已还金额',
    status        VARCHAR(16)   NOT NULL DEFAULT 'unsettled' COMMENT '账单状态: unsettled=未结清 settled=已结清 transferred=已转结',
    deleted       TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at    DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_fin_debt_bill_no (bill_no),
    KEY idx_fin_debt_group (group_code),
    KEY idx_fin_debt_store (store_code),
    KEY idx_fin_debt_status (status),
    KEY idx_fin_debt_brand (brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='欠款单表';

-- ============================================================
-- 六、还款明细表
-- 转移结算记录由商户合并审批通过时系统自动生成，can_delete=0 不可删除
-- ============================================================
CREATE TABLE IF NOT EXISTS biz_fin_debt_repayment (
    id           BIGINT        PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    bill_id      BIGINT        NOT NULL                   COMMENT '欠款单ID (关联 biz_fin_debt_bill.id)',
    bill_no      VARCHAR(32)   NOT NULL                   COMMENT '账单编号快照',
    repay_date   DATE                                     COMMENT '还款日期',
    channel      VARCHAR(32)   NOT NULL                   COMMENT '还款渠道: 推广金扣款/营业额扣款/对公转账/转移结算',
    amount       DECIMAL(14,2) NOT NULL DEFAULT 0.00      COMMENT '还款金额',
    remark       VARCHAR(500)                             COMMENT '备注',
    operator     VARCHAR(64)                              COMMENT '操作人',
    operate_time DATETIME                                 COMMENT '操作时间',
    can_delete   TINYINT       DEFAULT 1                  COMMENT '是否可删除: 1=可删除 0=系统生成不可删除',
    deleted      TINYINT       DEFAULT 0                  COMMENT '逻辑删除',
    created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    KEY idx_fin_repay_bill (bill_id),
    KEY idx_fin_repay_bill_no (bill_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='欠款还款明细表';

-- ============================================================
-- 七、业务编号序号表
-- 统一管理各类业务编号的每日自增序号（前缀 + 年月日 + 4位自增）
-- 前缀: CZ=充值流程 KK=扣款流程 ZZ=转账流程 HB=合并流程 PC=批次 MX=明细 QK=欠款单
-- 生成方式: INSERT ... ON DUPLICATE KEY UPDATE current_value = current_value + 1
-- ============================================================
CREATE TABLE IF NOT EXISTS sys_biz_seq (
    id            BIGINT      PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    prefix        VARCHAR(8)  NOT NULL                   COMMENT '编号前缀',
    date_key      VARCHAR(8)  NOT NULL                   COMMENT '日期键 yyyyMMdd',
    current_value INT         NOT NULL DEFAULT 0         COMMENT '当前序号(从0开始，编号中补齐4位)',
    created_at    DATETIME    DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    updated_at    DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_biz_seq (prefix, date_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务编号序号表';

-- ============================================================
-- 八、初始数据（幂等：仅当不存在时插入）
-- 财务三级审批角色，需在「角色管理」菜单绑定给对应审批人员
-- 拥有系统角色 admin 的用户可审批所有节点（后端兜底）
-- ============================================================
INSERT INTO sys_role (name, code, description, status)
SELECT '业务主管审批', 'FIN_BIZ_APPROVER', '财务审批流程第一级：业务主管节点审批权限', 1
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'FIN_BIZ_APPROVER');

INSERT INTO sys_role (name, code, description, status)
SELECT '运营主管审批', 'FIN_OPS_APPROVER', '财务审批流程第二级：运营主管节点审批权限', 1
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'FIN_OPS_APPROVER');

INSERT INTO sys_role (name, code, description, status)
SELECT '财务主管审批', 'FIN_FIN_APPROVER', '财务审批流程第三级：财务主管节点审批权限，通过后生成批次/明细/欠款单', 1
WHERE NOT EXISTS (SELECT 1 FROM sys_role WHERE code = 'FIN_FIN_APPROVER');

