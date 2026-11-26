# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 346: CPM 工作记录新增跟进/阻塞/取消标记维度
-- 用途：follow_up/blocked 为独立布尔标记；blocked_reason/cancel_reason 存人工原因。
-- 取消复用 biz_cpm_item.status='cancelled'，不扩枚举；会议来源取消同状态，来源由 source_type 区分。
-- 本脚本为一次性参考文档；实际幂等由 cpm:schema:v1.5 的 addColumnIfAbsent + 后置校验负责。
ALTER TABLE biz_cpm_item
  ADD COLUMN follow_up TINYINT NOT NULL DEFAULT 0 COMMENT '1=跟进工作（与 planType 正交的独立维度）';
ALTER TABLE biz_cpm_item
  ADD COLUMN blocked TINYINT NOT NULL DEFAULT 0 COMMENT '1=阻塞（只作标记，不冻结进度/备注/排期编辑）';
ALTER TABLE biz_cpm_item
  ADD COLUMN blocked_reason VARCHAR(200) NULL COMMENT '阻塞原因（服务端必填校验，解除时清空）';
ALTER TABLE biz_cpm_item
  ADD COLUMN cancel_reason VARCHAR(200) NULL COMMENT '人工取消原因（会议来源取消为空，由 source_type 区分）';
