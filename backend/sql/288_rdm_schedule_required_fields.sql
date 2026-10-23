-- 288: 排期必填字段与代码闸门对齐（schedule.required_fields 补 project / iteration）
-- 参考副本（不进镜像）：权威执行版在 RdmSchemaMigrationInitializer#doScheduleRequiredFieldsSeed。
-- 背景：归属体系改造把「项目+迭代」做成排期硬闸门（applyProjectAndIteration required=true），
--       但 204 种子里 schedule 的 required_fields 仍是 planDate；详情页动作弹窗按服务端下发的
--       requiredFields 渲染字段，导致排期弹窗没有项目/迭代选择器，用户只能看到
--       「提交排期必須選擇所屬項目與迭代」却无处可选。
-- 口径：只改仍为 204 旧值 planDate 的行，不覆盖管理员自定义。
-- 幂等：条件 UPDATE，可安全重放；无 DROP / 无删列。

UPDATE rdm_transition
   SET required_fields = 'planDate,project,iteration'
 WHERE from_status = 'review_passed'
   AND to_status = 'scheduled'
   AND action_code = 'schedule'
   AND required_fields = 'planDate'
   AND deleted = 0;
