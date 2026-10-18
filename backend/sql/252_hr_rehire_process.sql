-- 252: 「重新入職」单据类型的 OA 流程种子（方案 §5.3 入转调离含重新入职、§6.1 不新增侧边栏菜单）
-- 背景：入转调离引擎已支持 入职/转正/调动/离职/合同续签 五类单据，缺「离职后返聘」这一环，
--       导致方案 §8 的验收门槛「从待入职到离职再入职可完整追溯」无法闭合：
--       返聘只能走「入职」单据，而入职会新建账号，把同一个人拆成两份档案（工号、历史单据、资产归属都断开）。
-- 本批只补流程定义：单据表无需加列（沿用调动那套 new_dept_id / new_position_id / effective_date），
--       授权也无需新动作（重新入职锚在既有 hr-onboarding 菜单，与续签挂 contract-ledger 同一处理法）。
-- 为什么必须走 versionKey：只改 HrLifecycleConstants 的 Java 常量不会落到存量库，
--       缺流程定义时提交单据会在 OaRequestService.submit 报「流程不存在」——这是配置类缺失，越早发现越好。
-- 说明：本文件为一次性参考文档；实际执行与后置校验由 HrRehireProcessInitializer
--       （hr:rehire-process:v1.0，@Order(35)）负责，并登记 catalog.json。

INSERT IGNORE INTO biz_oa_process
    (process_code, process_name, category, icon, description, workflow_type, sort_order, status)
VALUES ('hr_rehire', '重新入職', 'hr', 'LoginOutlined',
        '離職員工返聘複職審批流程，通過後復用原賬號、開啟新一段僱傭並要求首次登錄改密',
        'oa_general', 16, 1);

-- 办理动作（HrLifecycleCallbackServiceImpl.applyRehire）三条不可让步的口径：
--   1) 是否真离职走统一 as-of 口径（HrAssignmentQuery），不看账号 status（被冻结的在职员工 status 也是 0），
--      也不看「最新一条记录」（会被一张未来生效的离职单骗到）。
--   2) 复用原 userId，不新建账号：新一段雇佣由 hr_employment_period 的 period_seq 递增表达。
--   3) 复职必须 must_change_password=1 且清 active_token：离职期间密码可能被留存，沿用等于默认交还账号。
