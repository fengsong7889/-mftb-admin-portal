# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 347: CPM 工作台账容量查询索引
-- 用途：支撑默认窗口（活动任务 + 最近 12 个月关闭任务）、归档游标分页与周期排序。
-- 本脚本为一次性参考文档；实际幂等由 cpm:schema:v1.6 的 addIndexIfAbsent + 后置校验负责。
ALTER TABLE biz_cpm_item
  ADD INDEX idx_cpm_item_user_deleted_status_updated (user_id, deleted, status, updated_at);
ALTER TABLE biz_cpm_item
  ADD INDEX idx_cpm_item_user_deleted_plan_start (user_id, deleted, plan_start, work_date, id);
