# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。
-- =============================================================================
-- 336: 持续绩效系统（cpm）底座 —— 12 张 biz_cpm_* 表
--
-- 真值位置：backend/modules/legacy/src/main/resources/336_cpm_core.sql（打进镜像被执行），
--          backend/sql/ 下同名文件为参考副本。
-- 实际幂等执行由 CpmSchemaMigrationInitializer 的 cpm:schema:v1.0 负责
-- （CREATE TABLE IF NOT EXISTS 可安全重放；后置校验全部通过才记版本）。
--
-- 设计口径（竞品对标版方案 §六；钉钉日志/飞书汇报/Tita CFR 的收敛定制）：
--   1) 条目（item）是事实原子：日视图=条目按活跃日的投影，不单独建"日报"实体；
--   2) 进度流水只追加：条目主表 status/progress 是最新缓存，轨迹真源在流水；
--      周报按 itemId 去重合并、状态取期末——两套口径必然漂移，所以数字只从流水收敛；
--   3) 汇报发布即快照冻结（content_json），修订走重新生成草稿再发布，
--      与 meeting 纪要草稿/正式版本隔离同一哲学；
--   4) CFR 反馈三件套：评论（Feedback）、点赞（轻量认可）、成果认定（Recognition）。
--      认定 with from<>to 的 CHECK 兜底——自认自绩在页面上点不出来，在库里也写不进去；
--   5) 工时是投入侧数据（work_hours 仅分布统计），不进任何评价 SQL；
--      不提供跨员工排名视图，反内卷红线由服务层与页面共同保证；
--   6) 人员列只建索引不建 FK（sys_user 有历史软删，加 FK 会让启动失败，用车/会议域同口径）；
--      cpm 域内表之间用 FK 硬约束。
-- 幂等：全部 CREATE TABLE IF NOT EXISTS，可重复执行。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. 工作条目（事实原子）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_item (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    user_id       BIGINT       NOT NULL COMMENT '归属人 sys_user.id（一律服务端由 JWT 注入，请求体无身份字段位置）',
    work_date     DATE         NOT NULL COMMENT '首次记录日（Asia/Shanghai 业务日）',
    title         VARCHAR(200) NOT NULL COMMENT '事项标题（与 CpmConstants.TITLE_MAX 同源）',
    detail        VARCHAR(2000) NULL COMMENT '事项说明',
    category      VARCHAR(32)  NOT NULL DEFAULT 'general' COMMENT '分类键，随岗位模板词表（biz_cpm_template.categories_json）',
    status        VARCHAR(16)  NOT NULL DEFAULT 'doing' COMMENT 'todo/doing/done/blocked',
    progress      TINYINT      NOT NULL DEFAULT 0 COMMENT '0-100；done 时服务端强制 100',
    work_hours    DECIMAL(4,1) NULL COMMENT '投入工时（小时）；仅用于分布统计，禁止进评价口径（Worktile 工时≠绩效共识）',
    source_type   VARCHAR(16)  NOT NULL DEFAULT 'manual' COMMENT 'manual/ai/rdm_requirement/meeting_action',
    source_ref    VARCHAR(64)  NULL COMMENT '外部对象标识（RDM 需求号 / 会议行动项 id）；manual 为 NULL',
    source_label  VARCHAR(200) NULL COMMENT '来源对象标题快照：外部对象改名不得改写历史记录的展示',
    template_key  VARCHAR(32)  NULL COMMENT '记录时所用岗位模板键快照',
    target_id     BIGINT       NULL COMMENT '预留：未来 OKR/目标挂点（本期服务端不读取）',
    created_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    version       INT          NOT NULL DEFAULT 0 COMMENT '乐观锁版本：并发双端更新只有一边能赢',
    active_user     BIGINT GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN user_id END) STORED COMMENT '软删感知唯一作用域：归属人',
    active_src_type VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN source_type END) STORED COMMENT '软删感知唯一作用域：来源类型',
    active_src_ref  VARCHAR(64) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN source_ref END) STORED COMMENT '软删感知唯一作用域：来源对象',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_item_source (active_user, active_src_type, active_src_ref),
    KEY idx_cpm_item_user_date (user_id, work_date),
    KEY idx_cpm_item_user_status (user_id, status),
    CONSTRAINT ck_cpm_item_status CHECK (status IN ('todo','doing','done','blocked')),
    CONSTRAINT ck_cpm_item_progress CHECK (progress >= 0 AND progress <= 100),
    CONSTRAINT ck_cpm_item_source CHECK (source_type IN ('manual','ai','rdm_requirement','meeting_action'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 工作条目：日/周/月报的共同事实源';

-- -----------------------------------------------------------------------------
-- 2. 进度流水（只追加；条目主表缓存最新值，轨迹与期末状态都从这里收敛）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_item_update (
    id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    item_id      BIGINT       NOT NULL COMMENT '所属条目',
    update_date  DATE         NOT NULL COMMENT '更新发生的业务日（周报聚合按此去重回条目）',
    progress     TINYINT      NOT NULL DEFAULT 0 COMMENT '当日期末进度 0-100',
    status       VARCHAR(16)  NOT NULL COMMENT '当日期末状态',
    note         VARCHAR(500) NULL COMMENT '一句话说明（选填）',
    created_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '操作人',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
    PRIMARY KEY (id),
    KEY idx_cpm_item_update_item (item_id, update_date),
    CONSTRAINT fk_cpm_update_item FOREIGN KEY (item_id) REFERENCES biz_cpm_item (id),
    CONSTRAINT ck_cpm_update_status CHECK (status IN ('todo','doing','done','blocked')),
    CONSTRAINT ck_cpm_update_progress CHECK (progress >= 0 AND progress <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 进度流水：跨周期追踪与周报轨迹的唯一真源';

-- -----------------------------------------------------------------------------
-- 3. 汇报（周/月/季；日报不建实体=条目日视图。UNIQUE(人,周期,期初)：每人每期一份）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_report (
    id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    user_id       BIGINT       NOT NULL COMMENT '汇报人 sys_user.id（服务端注入）',
    period_type   VARCHAR(16)  NOT NULL COMMENT 'week/month/quarter',
    period_start  DATE         NOT NULL COMMENT '周期起点（周=周一，业务时区 Asia/Shanghai）',
    period_end    DATE         NOT NULL COMMENT '周期止点',
    content_json  MEDIUMTEXT   NOT NULL COMMENT '快照 schemaVersion=1：items[]（含 itemId/期末状态/进度轨迹）+ totals；发布时冻结',
    summary       VARCHAR(2000) NULL COMMENT '汇总摘要（人工写或 AI 起草后人工确认）',
    ai_summary    TINYINT      NOT NULL DEFAULT 0 COMMENT '摘要是否 AI 生成：1=界面与导出必须披露（数字永不来自模型）',
    status        VARCHAR(16)  NOT NULL DEFAULT 'draft' COMMENT 'draft/published；published 后不可改（对齐纪要草稿/正式隔离）',
    published_at  DATETIME     NULL COMMENT '发布（提交）时间',
    created_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '创建人',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted       TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删',
    version       INT          NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
    active_user    BIGINT      GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN user_id END) STORED COMMENT '软删感知唯一作用域：汇报人',
    active_period  VARCHAR(16) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN period_type END) STORED COMMENT '软删感知唯一作用域：周期',
    active_start   DATE        GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN period_start END) STORED COMMENT '软删感知唯一作用域：期初',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_report_scope (active_user, active_period, active_start),
    CONSTRAINT ck_cpm_report_period CHECK (period_type IN ('week','month','quarter')),
    CONSTRAINT ck_cpm_report_status CHECK (status IN ('draft','published')),
    CONSTRAINT ck_cpm_report_range CHECK (period_end >= period_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 汇报（周/月/季报）：确定性聚合 + 可选 AI 摘要，发布即提交';

-- -----------------------------------------------------------------------------
-- 4. 已读回执（钉钉口径三件套之一：已读人数；打开且有查看权限时服务端登记）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_report_read (
    id             BIGINT  NOT NULL AUTO_INCREMENT COMMENT '主键',
    report_id      BIGINT  NOT NULL COMMENT '所属汇报',
    reader_user_id BIGINT  NOT NULL COMMENT '阅读人 sys_user.id',
    read_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次已读时间（同日重复打开不重记）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_report_read (report_id, reader_user_id),
    CONSTRAINT fk_cpm_read_report FOREIGN KEY (report_id) REFERENCES biz_cpm_report (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 汇报已读回执：送达/已读统计的唯一真源';

-- -----------------------------------------------------------------------------
-- 5. 评论 / 反馈（CFR 的 Feedback；一层回复用 parent_id）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_comment (
    id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    target_type VARCHAR(8)   NOT NULL COMMENT 'item/report',
    target_id   BIGINT       NOT NULL COMMENT '目标 id（同类型内定位；跨类型不共键）',
    user_id     BIGINT       NOT NULL COMMENT '评论人 sys_user.id',
    parent_id   BIGINT       NULL COMMENT '一层回复的父评论；再深拒绝（评论盖楼不是沟通工具的职责）',
    content     VARCHAR(500) NOT NULL COMMENT '评论内容（与 CpmConstants.COMMENT_MAX 同源）',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评论时间',
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted     TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除：仅作者可删自己的评论',
    PRIMARY KEY (id),
    KEY idx_cpm_comment_target (target_type, target_id),
    CONSTRAINT ck_cpm_comment_target CHECK (target_type IN ('item','report'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 反馈评论：可见范围内才能评（服务层判定），留言即辅导';

-- -----------------------------------------------------------------------------
-- 6. 点赞（轻量认可；与认定分层——点赞无通知成本压力，认定才是绩效证据）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_reaction (
    id          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    target_type VARCHAR(8)  NOT NULL COMMENT 'item/report',
    target_id   BIGINT      NOT NULL COMMENT '目标 id',
    user_id     BIGINT      NOT NULL COMMENT '点赞人 sys_user.id',
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '点赞时间',
    deleted     TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除（取消赞）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_reaction (target_type, target_id, user_id),
    CONSTRAINT ck_cpm_reaction_target CHECK (target_type IN ('item','report'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 点赞：同目标同人唯一，重复点击是取消而非刷数';

-- -----------------------------------------------------------------------------
-- 7. 成果认定（Recognition：上级对条目/汇报的正式认可，员工的绩效证据）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_recognition (
    id           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    target_type  VARCHAR(8)   NOT NULL COMMENT 'item/report',
    target_id    BIGINT       NOT NULL COMMENT '被认定的目标',
    from_user_id BIGINT       NOT NULL COMMENT '认定人（发起反馈的上级/授权人）',
    to_user_id   BIGINT       NOT NULL COMMENT '被认定人：服务端由目标归属推导，不接受前端传入（防伪造台账）',
    target_title VARCHAR(200) NULL COMMENT '目标标题快照：认定不随条目改名/删除而失去可读性（成果档案时间线依赖）',
    kind         VARCHAR(16)  NOT NULL COMMENT 'highlight=亮點 milestone=里程碑',
    comment      VARCHAR(500) NOT NULL COMMENT '认定说明（会展示在本人成果档案）',
    period_tag   VARCHAR(16)  NOT NULL COMMENT '归属期间标（如 2026-Q4），期末汇总取证口径',
    sync_to_perf TINYINT      NOT NULL DEFAULT 0 COMMENT '预留：HR 绩效考核取证同步标记（二期接口，本期服务端不读取）',
    synced_at    DATETIME     NULL COMMENT '预留：同步时间',
    created_by   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '操作人姓名快照',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '认定时间',
    deleted      TINYINT      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    active_type  VARCHAR(8)   GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN target_type END) STORED COMMENT '软删感知唯一作用域：类型',
    active_id    BIGINT       GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN target_id END) STORED COMMENT '软删感知唯一作用域：目标',
    active_from  BIGINT       GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN from_user_id END) STORED COMMENT '软删感知唯一作用域：认定人',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_recognition (active_type, active_id, active_from),
    KEY idx_cpm_recognition_to (to_user_id, period_tag),
    CONSTRAINT ck_cpm_recognition_target CHECK (target_type IN ('item','report')),
    CONSTRAINT ck_cpm_recognition_kind CHECK (kind IN ('highlight','milestone')),
    CONSTRAINT ck_cpm_recognition_self CHECK (from_user_id <> to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 成果认定：自认自绩被 CHECK 硬拒；同人同目标重复认定被唯一键硬拒';

-- -----------------------------------------------------------------------------
-- 8. 团队可见性授权（直属下属由部门主管关系推导，本表兜显式授权与推导留痕）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_view_grant (
    id             BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    viewer_user_id BIGINT      NOT NULL COMMENT '可见方（上级/被授权人）sys_user.id',
    target_user_id BIGINT      NOT NULL COMMENT '被查看方 sys_user.id',
    grant_type     VARCHAR(16) NOT NULL COMMENT 'dept_manager=部门主管关系推导 explicit=显式授权',
    granted_by     VARCHAR(64) NOT NULL DEFAULT '' COMMENT '授权操作人（推导行写 system）',
    created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    deleted        TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    active_viewer  BIGINT      GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN viewer_user_id END) STORED,
    active_target  BIGINT      GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN target_user_id END) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_view_grant (active_viewer, active_target),
    CONSTRAINT ck_cpm_view_grant_type CHECK (grant_type IN ('dept_manager','explicit'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 团队可见性：范围=本人+推导下属+显式授权；服务层硬判定，不接受前端传 scope';

-- -----------------------------------------------------------------------------
-- 9. 岗位模板（通用性来自结构统一，岗位差异只落词表与提示语——不做自定义字段引擎）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_template (
    id                 BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    template_key       VARCHAR(32) NOT NULL COMMENT '模板键（product/dev/qa/ops/general 或自定义）',
    name               VARCHAR(32) NOT NULL COMMENT '显示名',
    role_hint          VARCHAR(64) NOT NULL DEFAULT '' COMMENT '岗位提示（一句话说明该模板服务谁）',
    categories_json    TEXT        NOT NULL COMMENT '分类词表 [{key,label,hint}]；AI 归类白名单同源',
    work_hours_enabled TINYINT     NOT NULL DEFAULT 0 COMMENT '1=记录页显示工时快选（仅分布统计）',
    is_builtin         TINYINT     NOT NULL DEFAULT 0 COMMENT '内置模板不可删除（可停用）',
    enabled            TINYINT     NOT NULL DEFAULT 1 COMMENT '启用状态',
    remark             VARCHAR(200) NULL COMMENT '备注',
    created_by         VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建人',
    created_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by         VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    deleted            TINYINT     NOT NULL DEFAULT 0 COMMENT '逻辑删除',
    active_key         VARCHAR(32) GENERATED ALWAYS AS (CASE WHEN deleted = 0 THEN template_key END) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_template_key (active_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 岗位模板：新岗位接入=加一行词表，零代码';

-- -----------------------------------------------------------------------------
-- 10. 汇报规则（一期全局单行；RDM 先单行后拆多规则的同款克制）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_rule (
    id                   BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    rule_slot            VARCHAR(16) NOT NULL COMMENT '配置槽位，恒 default（唯一键保证全表一行）',
    enabled              TINYINT     NOT NULL DEFAULT 1 COMMENT '规则总开关：关闭后提醒与推送都停',
    period_types_json    VARCHAR(64) NOT NULL DEFAULT '["week"]' COMMENT '启用的周期集合（JSON 数组字符串）',
    deadline_day         TINYINT     NOT NULL DEFAULT 5 COMMENT '周报截止星期 1-7（周一=1）',
    deadline_time        VARCHAR(5)  NOT NULL DEFAULT '18:00' COMMENT '截止时刻 HH:mm',
    remind_before_hours  INT         NOT NULL DEFAULT 4 COMMENT '截止前多少小时催办（同日去重）',
    receiver_manager     TINYINT     NOT NULL DEFAULT 1 COMMENT '接收人=直属上级（部门主管关系推导）',
    extra_receiver_ids   VARCHAR(500) NOT NULL DEFAULT '' COMMENT '追加接收人 sys_user.id，前后带逗号：,12,35,',
    group_push           TINYINT     NOT NULL DEFAULT 1 COMMENT '群报卡片开关',
    personal_push        TINYINT     NOT NULL DEFAULT 1 COMMENT '个人工作通知开关',
    remark               VARCHAR(200) NULL COMMENT '备注（变更原因）',
    created_by           VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建人',
    created_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_by           VARCHAR(64) NOT NULL DEFAULT '' COMMENT '最后更新人',
    updated_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_rule_slot (rule_slot),
    CONSTRAINT ck_cpm_rule_deadline_day CHECK (deadline_day BETWEEN 1 AND 7),
    CONSTRAINT ck_cpm_rule_remind_hours CHECK (remind_before_hours >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 汇报规则：周期/截止/提醒/接收人/推送开关（页面可配即时生效）';

-- -----------------------------------------------------------------------------
-- 11. AI 提取台账（复刻纪要安全模式：requestKey 幂等、payload 限期清除、断线重查）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_ai_extraction (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    request_key     VARCHAR(64)  NOT NULL COMMENT '客户端操作识别码：同键同哈希返回原结果，同键换内容拒绝',
    user_id         BIGINT       NOT NULL COMMENT '发起人 sys_user.id',
    status          VARCHAR(16)  NOT NULL DEFAULT 'processing' COMMENT 'processing/succeeded/failed/expired',
    input_hash      VARCHAR(64)  NOT NULL COMMENT '原文哈希（SHA-256 hex）：幂等比对唯一依据',
    payload_json    MEDIUMTEXT   NULL COMMENT '原文+上下文的临时载荷：成功/过期后由定时任务限期清除（7 天）',
    result_json     MEDIUMTEXT   NULL COMMENT '结构化提取结果（预览用；用户确认前不落正式表）',
    prompt_version  VARCHAR(32)  NOT NULL DEFAULT 'cpm-ai-v1' COMMENT 'Prompt 版本（服务端固定，不由前端传）',
    schema_version  INT          NOT NULL DEFAULT 1 COMMENT '输出结构版本',
    error_code      VARCHAR(32)  NULL COMMENT '失败码：不存异常堆栈（错误详情只进日志）',
    usage_json      VARCHAR(256) NULL COMMENT 'token 用量 JSON（计量与预算扣减）',
    model_key       VARCHAR(64)  NULL COMMENT '实际使用的模型',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_cpm_ai_request (request_key),
    KEY idx_cpm_ai_status_updated (status, updated_at),
    CONSTRAINT ck_cpm_ai_status CHECK (status IN ('processing','succeeded','failed','expired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM AI 提取台账：处理超 2 分钟置 expired；原文只作一次性载荷不长期留存';

-- -----------------------------------------------------------------------------
-- 12. 投递/提醒记录（发布送达、截止催办、认定通知都在这；同事件同期同人唯一防重发）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biz_cpm_push_record (
    id           BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    event_type   VARCHAR(24) NOT NULL COMMENT 'report_published/report_deadline_remind/recognition_granted',
    user_id      BIGINT      NOT NULL COMMENT '接收人 sys_user.id（认定事件=被认定人）',
    period_start DATE        NOT NULL COMMENT '幂等作用域期初（催办按人+周一去重，发布按人+报告ID记 0 起点）',
    ref_id       BIGINT      NULL COMMENT '关联对象（汇报 id / 认定 id）',
    status       VARCHAR(16) NOT NULL DEFAULT 'queued' COMMENT 'queued/sent/skipped/failed',
    channel      VARCHAR(16) NOT NULL DEFAULT 'dingtalk' COMMENT '投递通道',
    reason       VARCHAR(200) NULL COMMENT 'skipped/failed 原因（如 未绑定钉钉 / dry-run）',
    sent_at      DATETIME    NULL COMMENT '实际发出时间',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    active_event VARCHAR(24) GENERATED ALWAYS AS (CASE WHEN status IN ('queued','sent') THEN event_type END) STORED,
    PRIMARY KEY (id),
    KEY idx_cpm_push_scope (event_type, user_id, period_start),
    CONSTRAINT ck_cpm_push_status CHECK (status IN ('queued','sent','skipped','failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CPM 投递记录：dry-run 全部登记为 skipped；重试只补 failed 不重发 sent';
