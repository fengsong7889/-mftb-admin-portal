-- 280: RDM 产品经理 PRD 任务（参考副本；权威执行版在 classpath resources 同名文件）
-- 背景：接受需求时要求填写承诺出 PRD 日期，但该承诺只落在 rdm_requirement.promised_prd_date；
--       子任务页签与甘特图只读 rdm_work_task，导致「产品经理什么时候出 PRD」在任务视图里完全不可见。
-- 本迁移：① 注册内置任务类型 prd（PRD 產出）；② 状态「PRD設計中」改名「PRD 產出中」，与 UI 设计区分；
--         ③ 为存量在途且已承诺 PRD 日期的需求补建 PRD 任务。
-- 幂等：INSERT IGNORE + 条件 UPDATE + NOT EXISTS，可安全重放；无 DROP / 无删列。

INSERT IGNORE INTO rdm_task_type_config (code, label, color, category, enabled, sort_order, remark) VALUES
('prd', 'PRD 產出', '#E8720C', 'design', 1, 5, '內建範本（受理需求時自動生成）');

UPDATE rdm_status_def SET label = 'PRD 產出中'
 WHERE code = 'prd_designing' AND label IN ('PRD設計中', 'PRD 設計中', 'PRD 編寫中');

-- 需求池的历史处理人是硬编码角色名「技術負責人」：有指定负责人时改成真实的人（姓名+工号），
-- 没指定的明确写成「待指派」，避免列表里出现一个找不到人的角色名。
UPDATE rdm_requirement r
  JOIN sys_user u ON u.id = r.dispatcher_user_id AND u.deleted = 0
   SET r.current_handler_name = CONCAT(u.name, '（', u.emp_id, '）')
 WHERE r.deleted = 0 AND r.status = 'pool' AND r.dispatcher_user_id IS NOT NULL
   AND u.emp_id IS NOT NULL AND u.emp_id <> '';

UPDATE rdm_requirement
   SET current_handler_name = '技術部（待指派）'
 WHERE deleted = 0 AND status = 'pool'
   AND (current_handler_name IS NULL OR current_handler_name = '技術負責人');

-- 存量补建：只补「已承诺 PRD、仍在途」且尚无 prd 任务的需求。
-- 任务编号 RTPRD + 8 位需求ID：一次性历史补建专用，保证唯一且与正常发号（RT+日期+流水）不冲突。
INSERT INTO rdm_work_task (
    task_no, req_id, task_type, title, content, owner_user_id, owner_emp_no, owner_name,
    role_code, status, progress, plan_start_date, plan_finish_date, iteration_code, created_by, updated_by
)
SELECT CONCAT('RTPRD', LPAD(r.id, 8, '0')),
       r.id,
       'prd',
       '產出 PRD 並提交評審',
       CONCAT('需求受理時承諾 ', DATE_FORMAT(r.promised_prd_date, '%Y-%m-%d'),
              ' 前產出 PRD；提交評審後本任務自動完成。'),
       r.assignee_pm_user_id,
       r.assignee_pm_emp_no,
       r.assignee_pm_name,
       'PM',
       'todo',
       0,
       COALESCE(DATE(r.accept_time), r.promised_prd_date),
       r.promised_prd_date,
       r.iteration_code,
       'system:migration',
       'system:migration'
  FROM rdm_requirement r
 WHERE r.deleted = 0
   AND r.promised_prd_date IS NOT NULL
   AND r.assignee_pm_user_id IS NOT NULL
   AND r.status NOT IN ('released', 'verified', 'closed')
   AND NOT EXISTS (
       SELECT 1 FROM rdm_work_task t
        WHERE t.req_id = r.id AND t.task_type = 'prd' AND t.deleted = 0
   );
