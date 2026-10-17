-- 244: 会议室档案新增所在城市列（跨城办公场景防订错）
-- 实际幂等执行由 MeetingSchemaMigrationInitializer.repairSchema() 承担
-- （REQUIRED_ADDED_COLUMNS 先查 information_schema 再补列，每次启动重放），
-- 本文件为一次性参考文档。档案列与 campus/building 同口径：NOT NULL DEFAULT ''，
-- 空串=未填城市，不拿 NULL 表达缺失（update 逐列显式 set，落 null 会撞约束）。

ALTER TABLE biz_meeting_room
    ADD COLUMN city VARCHAR(64) NOT NULL DEFAULT '' COMMENT '所在城市（如 深圳；跨城办公防订错）' AFTER room_name;
