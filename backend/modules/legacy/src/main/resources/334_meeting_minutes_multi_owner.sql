-- Copyright (c) 2026 fengsong7889. All Rights Reserved.
-- 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
-- 完整许可条款见仓库根目录 LICENSE 文件。
--
-- =============================================================================
-- 334: 纪要事项多负责人 —— biz_meeting_minutes_item_owner 负责人关联表 + 存量回填
--
-- 真值位置：backend/modules/legacy/src/main/resources/334_meeting_minutes_multi_owner.sql
--          （打进镜像被执行），backend/sql/ 下同名文件为参考副本，由结构锁用例断言逐字一致。
--
-- 为什么一条事项要能有多个负责人：一场会常把同一件事交给两个人一起办（主办 + 协办、
-- 跨部门共管），旧结构只能选一人，另一个人既收不到逾期提醒，也没有权限回填办理结果——
-- 于是纪要里写着"共同负责"，系统里只有一个人被追办。
--
-- 为什么单独成表而不是把 owner_user_id 改成 JSON 数组：
--   1) 事项要按"责任人"被逾期作业扫描、被回填状态、被提醒去重，这些都是按行查、按行更；
--      JSON 数组里的 id 建不了索引，"我负责的所有待办"要全表扫；
--   2) 负责人是有身份的对象（要回查 sys_user 判在职），塞进数组等于放弃外键保护。
--
-- 事项行上的 owner_user_id/owner_name/owner_emp_no 三列不删，语义退化为「首负责人缓存」：
--   写路径在同一事务内由 owners[0] 派生维护，idx_meeting_minutes_item_owner 继续服务旧查询。
--   本仓库推送即上生产且没有库级回滚手段，保留三列让旧版本 jar 仍按首负责人工作——
--   真值在本表，缓存列坏了最多显示错名字，反向（真值在缓存列）则会把多负责人抹成一个人。
--
-- 幂等：CREATE TABLE IF NOT EXISTS + 守卫式 INSERT IGNORE ... SELECT，可重复执行；
--       只增表不删列不改索引，因此无需反向脚本（回滚口径见文件末尾注释）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 事项负责人（多负责人真值）
--    seq：负责人在本事项内的顺序，从 1 起；seq=1 就是事项行上那三列缓存的来源。
--    user_name/emp_no：服务端按 user_id 回查 sys_user 写入的快照，前端自报一律不采信；
--      员工改名不改写历史纪要（与 owner_name 快照同一口径）。
--    外键指向事项表且不带 CASCADE：事项行只被逻辑退役（retire 置 deleted=1），
--      真删（旧版 v1 的 deleteSurplus）本来就不会碰到有负责人行的事项，
--      万一撞上，宁可让启动/写入直接报错，也不要静默留下指向不存在事项的负责人。
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_meeting_minutes_item_owner (
    id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    item_id      BIGINT      NOT NULL COMMENT '事项 biz_meeting_minutes_item.id',
    user_id      BIGINT      NOT NULL COMMENT '负责人 sys_user.id（姓名工号由服务端回查快照）',
    user_name    VARCHAR(64) NOT NULL DEFAULT '' COMMENT '负责人姓名快照',
    emp_no       VARCHAR(32) NOT NULL DEFAULT '' COMMENT '负责人工号快照',
    seq          INT         NOT NULL DEFAULT 1 COMMENT '负责人顺序（从 1 起，seq=1 即事项行首负责人缓存）',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_minutes_item_owner (item_id, user_id),
    KEY idx_meeting_minutes_item_owner_user (user_id, item_id),
    CONSTRAINT fk_meeting_minutes_item_owner_item FOREIGN KEY (item_id) REFERENCES biz_meeting_minutes_item (id),
    CONSTRAINT ck_meeting_minutes_item_owner_seq CHECK (seq > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='纪要事项负责人（多负责人真值，事项行三列退化为首负责人缓存）';

-- -----------------------------------------------------------------------------
-- 2. 存量回填：把事项行上的单负责人升格为一条 seq=1 的负责人记录
--    守卫条件是"本事项还没有任何负责人行"，因此可重复执行且不会与新版写入互相覆盖：
--    发布路径先删后插，回填只补空，两边都不会给同一事项长出两套负责人。
--    owner_user_id IS NULL 的行不回填——"无负责人"本身是事实，不能凭空造一个责任人，
--    更不能让他莫名收到催办。
-- -----------------------------------------------------------------------------
INSERT IGNORE INTO biz_meeting_minutes_item_owner (item_id, user_id, user_name, emp_no, seq)
SELECT i.id, i.owner_user_id, i.owner_name, i.owner_emp_no, 1
FROM biz_meeting_minutes_item i
WHERE i.owner_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM biz_meeting_minutes_item_owner o WHERE o.item_id = i.id);

-- -----------------------------------------------------------------------------
-- 回滚：只增表、不删列，旧代码只读事项行三列，因此保留本表与回填数据不影响旧版本运行。
-- 如需彻底清理（先在代码里停用负责人表，再按下列顺序手工执行）：
--   -- 1) 用负责人表里的 seq=1 行反向刷事项行三列（缓存列一直有效，此步通常是无操作）
--   -- UPDATE biz_meeting_minutes_item i
--   --   JOIN biz_meeting_minutes_item_owner o ON o.item_id = i.id AND o.seq = 1
--   --    SET i.owner_user_id = o.user_id, i.owner_name = o.user_name, i.owner_emp_no = o.emp_no;
--   -- 2) DROP TABLE biz_meeting_minutes_item_owner;
-- 注意第 2 步会永久删除"第 2 位及以后负责人"这一事实，属于不可逆操作，须先确认业务不再需要。
-- =============================================================================
