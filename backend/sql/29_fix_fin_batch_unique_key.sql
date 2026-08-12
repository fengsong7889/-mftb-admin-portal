-- 修复转账/合并流程批次号唯一约束冲突
-- 问题：转账流程写入两条批次记录（转出+转入）共享同一批次号，但唯一约束仅限制 batch_no 导致 DuplicateKeyException
-- 方案：将唯一约束从 (batch_no) 改为 (batch_no, group_code)，允许同一批次号对应不同集团

-- 1. 删除旧的唯一索引
ALTER TABLE biz_fin_batch DROP INDEX uk_fin_batch_no;

-- 2. 创建新的联合唯一索引（批次号 + 集团编码）
ALTER TABLE biz_fin_batch ADD UNIQUE KEY uk_fin_batch_no_group (batch_no, group_code);

-- 验证索引变更
SHOW INDEX FROM biz_fin_batch WHERE Key_name LIKE '%batch%';
