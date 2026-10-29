-- 309: 会议纪要附件（补充说明上传：Word / PDF / 图片）。
-- classpath 文件为执行真值，backend/sql 同名文件为逐字一致的参考副本。
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行；不回填、不修改既有纪要正文与版本快照。
-- 二进制只进对象存储，本表仅存元数据；对象键由服务端生成，绝不接受用户输入。

CREATE TABLE IF NOT EXISTS biz_meeting_minutes_attachment (
    id               BIGINT         NOT NULL AUTO_INCREMENT COMMENT '附件主键',
    attachment_no    CHAR(32)       NOT NULL COMMENT '对外附件标识（服务端生成的 32 位 hex，接口不暴露自增 id）',
    booking_id       BIGINT         NOT NULL COMMENT '归属会议单（上传时即锚定会议，跨会议绑定一律拒绝）',
    minutes_id       BIGINT         NULL COMMENT '绑定的纪要 id；NULL=尚未随纪要保存',
    request_key      VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '上传幂等键：同一次重试不重复占用存储',
    request_hash     CHAR(64)       NOT NULL COMMENT '幂等请求摘要：同键不同内容直接拒绝',
    upload_user_id   BIGINT         NOT NULL COMMENT '上传人 sys_user.id（未绑定附件仅本人可删）',
    upload_name      VARCHAR(64)    NOT NULL COMMENT '上传人姓名快照',
    original_name    VARCHAR(255)   NOT NULL COMMENT '清洗后的原始文件名（下载展示用，入库后不可变）',
    mime             VARCHAR(100)   NOT NULL COMMENT '服务端按扩展名白名单规范化的 MIME（不采信客户端自报值直存）',
    size_bytes       BIGINT         NOT NULL COMMENT '实际落盘字节数（以服务端流式计数为准）',
    sha256           CHAR(64)       NOT NULL COMMENT '内容摘要（完整性校验与去重的唯一依据）',
    storage_provider VARCHAR(16)    NOT NULL COMMENT '存储提供方标识（local/s3…）',
    object_key       VARCHAR(500)   NOT NULL COMMENT '对象键（服务端生成，含内容摘要，绝不接受用户输入）',
    status           TINYINT        NOT NULL DEFAULT 1 COMMENT '1=未绑定 2=已绑定草稿 3=已进入正式发布快照（不可物理删除）',
    created_by       VARCHAR(64)    NOT NULL COMMENT '创建人',
    created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by       VARCHAR(64)    NOT NULL COMMENT '更新人',
    updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_meeting_minutes_attachment_no (attachment_no),
    UNIQUE KEY uk_meeting_minutes_attachment_object (object_key),
    UNIQUE KEY uk_meeting_minutes_attachment_request (booking_id, request_key),
    KEY idx_meeting_minutes_attachment_minutes (minutes_id, status),
    KEY idx_meeting_minutes_attachment_cleanup (status, created_at),
    CONSTRAINT fk_meeting_minutes_attachment_booking FOREIGN KEY (booking_id) REFERENCES biz_meeting_booking (id),
    CONSTRAINT fk_meeting_minutes_attachment_minutes FOREIGN KEY (minutes_id) REFERENCES biz_meeting_minutes (id),
    CONSTRAINT fk_meeting_minutes_attachment_uploader FOREIGN KEY (upload_user_id) REFERENCES sys_user (id),
    CONSTRAINT ck_meeting_minutes_attachment_size CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    CONSTRAINT ck_meeting_minutes_attachment_status CHECK (status IN (1, 2, 3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会议纪要附件元数据（二进制入对象存储，本表不落文件内容）';
