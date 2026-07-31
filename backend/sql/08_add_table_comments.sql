-- ============================================================
-- 補齊 Sealos 生產庫已有表的中文註解（COMMENT）
-- 幂等可重複執行
-- ============================================================

-- 系統表
ALTER TABLE sys_user COMMENT='系统用户表（员工）';
ALTER TABLE sys_role COMMENT='角色表';
ALTER TABLE sys_department COMMENT='组织架构-部门表';
ALTER TABLE sys_position COMMENT='集团人事-职位表';
ALTER TABLE sys_menu COMMENT='系统菜单表';
ALTER TABLE sys_biz_seq COMMENT='业务编号序号表';

-- 業務表
ALTER TABLE biz_merchant_group COMMENT='商户集团表';
ALTER TABLE biz_store COMMENT='门店表';
ALTER TABLE biz_gift_record COMMENT='赠送记录表';
ALTER TABLE biz_gift_consume COMMENT='赠送消费流水表';

-- 財務表
ALTER TABLE biz_fin_account COMMENT='推广金账户表';
ALTER TABLE biz_fin_approval COMMENT='财务审批流程表';
ALTER TABLE biz_fin_batch COMMENT='推广金批次表';
ALTER TABLE biz_fin_detail COMMENT='推广金交易明细表';
ALTER TABLE biz_fin_debt_bill COMMENT='欠款单表';
ALTER TABLE biz_fin_debt_repayment COMMENT='欠款还款明细表';
