-- 128: OA多人审批审批记录追踪
-- 为审批任务表新增「已审批人」和「已审批时间」字段，支持会签(all)模式并保留完整审计轨迹
-- 修复：any模式下 approver 字段被覆写导致原始审批人列表丢失的问题

ALTER TABLE biz_oa_approval_task
    ADD COLUMN approved_by VARCHAR(500) DEFAULT NULL COMMENT '已审批人列表（逗号分隔，会签模式多人追加）' AFTER comment;

ALTER TABLE biz_oa_approval_task
    ADD COLUMN approved_times VARCHAR(1000) DEFAULT NULL COMMENT '已审批时间列表（逗号分隔，与approved_by一一对应）' AFTER approved_by;
