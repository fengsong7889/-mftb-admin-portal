-- 281: 钉钉日报消息卡片化（rdm_notify_log 补消息类型与卡片按钮）
--
-- 【本脚本仅作人工留档，不参与应用启动执行】
-- 真实 DDL 以内联形式写在 RdmSchemaMigrationInitializer（rdm:schema:v3.28），
-- 由 SchemaVersionTracker.applyOnce(key, task, verify) 门控；本文件不进镜像。
--
-- 背景：日报此前只能发 markdown 气泡，层级靠多级标题与嵌套列表，而钉钉 markdown
-- 不支持嵌套列表（缩进被子），项目/迭代/需求被压成同一层，观感杂乱。
-- 改为钉钉卡片消息（群机器人 actionCard / 工作通知 action_card）后，版式由
-- 卡片壳承载（标题 + 正文 + 底部按钮），消息类型与按钮必须独立存储：
--   · msg_type  ：dispatcher 据此选择发送方法，默认 markdown 保证存量行为不变
--   · btn_title ：按钮文案（钉钉限制 20 字符内，列宽 32 留余量）
--   · btn_url   ：按钮跳转地址（钉钉限制 500 字符内，列宽 512 留余量）

ALTER TABLE rdm_notify_log
    ADD COLUMN msg_type VARCHAR(16) NOT NULL DEFAULT 'markdown'
        COMMENT '投递消息类型: markdown/action_card（卡片带一个跳转按钮）' AFTER content;

ALTER TABLE rdm_notify_log
    ADD COLUMN btn_title VARCHAR(32) DEFAULT NULL
        COMMENT '卡片按钮文案（msg_type=action_card 时必填）' AFTER msg_type;

ALTER TABLE rdm_notify_log
    ADD COLUMN btn_url VARCHAR(512) DEFAULT NULL
        COMMENT '卡片按钮跳转地址（msg_type=action_card 时必填）' AFTER btn_title;
