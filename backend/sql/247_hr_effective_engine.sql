-- 247: HR 生效日引擎 —— 异动动作 code 列 + 待生效任务表
-- 背景（方案 §5.3 / §7.2 / §7.4）：
--   ① 「在职/离职」与「本次雇佣起点」以前靠匹配 operation 的中文名（库内存简体、界面显示繁体），
--      繁简混写或语言切换都会让判定静默失效；现改为匹配 operation_code。
--   ② 审批通过不等于生效：生效日在未来的单据必须先停在 approved（待生效），到点才改写任职投影
--      与账号状态。没有 hr_effective_task 就只能「审批时立刻生效」（未来离职提前停号）
--      或「全表扫单据猜谁该生效」（不可追踪、不可重试）。
-- 说明：本文件为一次性参考文档；实际执行与后置校验由 HrEffectiveEngineInitializer
--       （hr:effective-engine:v1.0，@Order(31)）负责，并登记 catalog.json 与 ContractRegistry。
--       生产仅 ADD/CREATE/回填 UPDATE，不做破坏性操作。

ALTER TABLE emp_position_record ADD COLUMN operation_code VARCHAR(24) DEFAULT NULL
    COMMENT '异动动作 code: ONBOARD/REGULAR/PROMOTION/TRANSFER/DEMISSION/DIMISSION/REHIRE/OTHER' AFTER operation;

-- MySQL 8.0.16+ 才真正 ENFORCED；初始化器只校验约束存在并在未强制时告警，避免在低版本库上把启动打死
ALTER TABLE emp_position_record ADD CONSTRAINT ck_position_op_code
    CHECK (operation_code IS NULL OR operation_code IN
        ('ONBOARD','REGULAR','PROMOTION','TRANSFER','DEMOTION','DIMISSION','REHIRE','OTHER'));

-- 回填：未命中的一律落 OTHER（派生端遇到 OTHER/NULL 退回名称判定，不改判历史事实）
UPDATE emp_position_record SET operation_code = CASE TRIM(operation)
    WHEN '入职' THEN 'ONBOARD'    WHEN '入職' THEN 'ONBOARD'
    WHEN '转正' THEN 'REGULAR'    WHEN '轉正' THEN 'REGULAR'
    WHEN '晋升' THEN 'PROMOTION'  WHEN '晉升' THEN 'PROMOTION'
    WHEN '调动' THEN 'TRANSFER'   WHEN '調動' THEN 'TRANSFER'
    WHEN '降职' THEN 'DEMOTION'   WHEN '降職' THEN 'DEMOTION'
    WHEN '离职' THEN 'DIMISSION'  WHEN '離職' THEN 'DIMISSION'
    WHEN '重新入职' THEN 'REHIRE' WHEN '重新入職' THEN 'REHIRE'
    ELSE 'OTHER' END
WHERE operation_code IS NULL AND deleted = 0;

CREATE TABLE IF NOT EXISTS hr_effective_task (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    request_id     BIGINT      NOT NULL COMMENT '关联 hr_lifecycle_request.id',
    req_no         VARCHAR(32) DEFAULT NULL COMMENT '单据编号快照',
    request_type   VARCHAR(16) DEFAULT NULL COMMENT '单据类型快照',
    user_id        BIGINT      DEFAULT NULL COMMENT '目标员工；入职单办理前可为空',
    effective_date DATE        NOT NULL COMMENT '生效日，到这天才算到期',
    status         VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/DONE/FAILED/CANCELLED',
    attempts       INT         NOT NULL DEFAULT 0 COMMENT '已尝试次数',
    last_error     VARCHAR(500) DEFAULT NULL COMMENT '最近一次失败原因',
    executed_at    DATETIME    DEFAULT NULL COMMENT '实际执行完成时间',
    created_by     VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    updated_by     VARCHAR(64) DEFAULT NULL COMMENT '最后更新人',
    created_at     DATETIME    DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at     DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_effective_request (request_id),
    KEY idx_effective_status_date (status, effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 待生效任务（轻量 outbox）';

-- 注：本表刻意不带 deleted 列 —— 它是执行留痕，删一行就再也回答不了「这单为什么到今天还没生效」；
--     唯一键 uk_effective_request 因此不需要像 att_* 那样把软删标记折进生成列。
