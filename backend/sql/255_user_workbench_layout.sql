-- 255: 产研交付个人工作台布局持久化
-- sys_user.workbench_layout 列：存储用户在工作台「個性化配置」面板里的区块显隐与排序偏好，JSON 格式。
-- 原先只写 localStorage（按工号隔离），刷新浏览器或换设备就丢失。改为后端持久化，前端仍以 localStorage 作离线缓存。
-- 与 quick_favorites / portal_favorites / ai_settings 分列：四者语义不同，整份覆盖写入，共用会互相抹掉。

ALTER TABLE sys_user
  ADD COLUMN workbench_layout TEXT NULL
  COMMENT '产研交付个人工作台布局偏好，JSON 格式如 {"v":1,"order":["metrics","dev-tasks"],"dismissed":["activity"]}';
