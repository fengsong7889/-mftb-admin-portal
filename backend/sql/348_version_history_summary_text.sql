# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。

-- 348: 版本历史概要改为 TEXT，避免 Git 同步按天拼接长提交列表时触发数据截断。
-- 本脚本为一次性参考文档；实际幂等由 version_history:summary-text-v1.0 的后置校验负责。
ALTER TABLE sys_version_history
  MODIFY COLUMN summary TEXT NOT NULL COMMENT '版本概要说明';
