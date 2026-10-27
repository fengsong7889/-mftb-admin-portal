-- 100_downgrade_exempt_quota.sql
-- 為 3 張額度策略表新增降級豁免額度字段
-- 降級豁免額度：主額度用完後，降級模型可獨立使用的額外額度（跟隨主額度分配方式）

-- 1. 員工職位額度策略表
ALTER TABLE ai_emp_quota_policy
    ADD COLUMN downgrade_exempt_quota DECIMAL(20,2) DEFAULT NULL
    COMMENT '降級豁免額度（主額度用完後降級模型可使用的獨立額度，與主額度分配方式一致）'
    AFTER downgrade_model_id;

-- 2. 角色額度策略表
ALTER TABLE ai_role_quota_policy
    ADD COLUMN downgrade_exempt_quota DECIMAL(20,2) DEFAULT NULL
    COMMENT '降級豁免額度（主額度用完後降級模型可使用的獨立額度，與主額度分配方式一致）'
    AFTER downgrade_model_id;

-- 3. 部門額度策略表
ALTER TABLE ai_dept_quota_policy
    ADD COLUMN downgrade_exempt_quota DECIMAL(20,2) DEFAULT NULL
    COMMENT '降級豁免額度（主額度用完後降級模型可使用的獨立額度，跟隨部門分配模式：total=共享豁免池/per_capita=每人獨立豁免池）'
    AFTER downgrade_model_id;
