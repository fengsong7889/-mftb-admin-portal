/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.constant;

/**
 * 持續績效系統（cpm）常量。
 *
 * <p><b>为什么状态与周期必须在常量层钉住</b>：条目状态判定同时存在于
 * Mapper 的期间聚合 SQL、服务层的期末状态收敛、前端时间线分组三处，
 * 任何一处把「進行中」写成别的取值，周报汇总就会与日视图对不上账。
 *
 * <p>口径来源：docs/design/持续绩效系统设计方案（2026-11 竞品对标版）。
 * 与 meeting 域 AI 链路共用治理（AiSceneService/额度/急停），场景键在此登记。
 */
public final class CpmConstants {

    private CpmConstants() {
    }

    /* ==================== 菜单 key（与 CpmSchemaMigrationInitializer 种子一一对应） ==================== */

    /** 我的工作記錄：使用侧，全员基线授权，服务层硬约束本人 */
    public static final String MENU_MY = "cpm-my";
    /** 我的匯報：使用侧，周/月/季聚合与发布 + 个人成果档案 */
    public static final String MENU_REPORT = "cpm-report";
    /** 團隊匯報：治理侧，可见范围查阅 + CFR 反馈/成果认定 */
    public static final String MENU_TEAM = "cpm-team";
    /** 模板管理：治理侧，岗位词表维护 */
    public static final String MENU_TEMPLATE = "cpm-template";
    /** 匯報規則：治理侧，周期/提醒/接收人/推送配置 */
    public static final String MENU_RULE = "cpm-rule";

    /* ==================== 授权动作 ==================== */

    public static final String ACTION_VIEW = "view";
    public static final String ACTION_EDIT = "edit";
    /**
     * 工作记录 AI 整理：与 edit 成对授予的独立动作（同 meeting 的 ai_minutes 口径）。
     * 能编辑记录不等于能让 AI 读原文并调模型——后者涉及出域与计费。
     */
    public static final String ACTION_AI_CPM = "ai_cpm";
    /** 匯報規則菜单的独立推送动作：能改规则不等于能群发 */
    public static final String ACTION_PUSH = "push";
    /** 手动补发/立即提醒动作 */
    public static final String ACTION_TRIGGER = "trigger";

    /** 使用侧动作集：view,edit,ai_cpm */
    public static final String ACTIONS_USAGE = "[\"view\",\"edit\",\"ai_cpm\"]";
    /** 治理侧只读+反馈动作集：view,edit（评论/点赞/认定都是 edit 语义） */
    public static final String ACTIONS_VIEW_EDIT = "[\"view\",\"edit\"]";
    /** 匯報規則动作集：view,edit,push,trigger */
    public static final String ACTIONS_RULE = "[\"view\",\"edit\",\"push\",\"trigger\"]";

    /* ==================== AI 场景与环境开关 ==================== */

    /** ai_scene_config 场景键（服务端固定注册，默认关闭） */
    public static final String SCENE_CPM_REPORT = "cpm_report";
    /** 环境级上限 yml 键：显式 false 才禁止 AI，不代表场景已启用或员工已授权 */
    public static final String CFG_AI_ENABLED = "cpm.ai-enabled";

    /* ==================== 条目状态（与 biz_cpm_item.status CHECK 同源） ==================== */

    public static final String STATUS_TODO = "todo";
    public static final String STATUS_DOING = "doing";
    public static final String STATUS_DONE = "done";
    public static final String STATUS_BLOCKED = "blocked";

    /* ==================== 汇报周期与状态 ==================== */

    public static final String PERIOD_WEEK = "week";
    public static final String PERIOD_MONTH = "month";
    public static final String PERIOD_QUARTER = "quarter";

    public static final String REPORT_STATUS_DRAFT = "draft";
    public static final String REPORT_STATUS_PUBLISHED = "published";

    /* ==================== 来源类型（biz_cpm_item.source_type CHECK） ==================== */

    public static final String SOURCE_MANUAL = "manual";
    public static final String SOURCE_AI = "ai";
    public static final String SOURCE_RDM = "rdm_requirement";
    public static final String SOURCE_MEETING_ACTION = "meeting_action";

    /* ==================== CFR 反馈 ==================== */

    public static final String TARGET_ITEM = "item";
    public static final String TARGET_REPORT = "report";

    public static final String RECOGNITION_HIGHLIGHT = "highlight";
    public static final String RECOGNITION_MILESTONE = "milestone";

    /** 团队可见性授权类型：部门主管推导 / 显式授权 */
    public static final String GRANT_DEPT_MANAGER = "dept_manager";
    public static final String GRANT_EXPLICIT = "explicit";

    /* ==================== 输入上限（与列宽逐字一致，禁止两处各写一份） ==================== */

    public static final int TITLE_MAX = 200;
    public static final int DETAIL_MAX = 2000;
    public static final int NOTE_MAX = 120;
    public static final int COMMENT_MAX = 500;
    public static final int AI_INPUT_MAX = 20_000;
    /** AI 提取单次返回条目上限：超出即视为模型跑飞，整次拒绝（同纪要白名单口径） */
    public static final int AI_ITEMS_MAX = 30;
    /** 音频转写：单文件字节上限 / 秒数上限（超限在转发给 ASR 前直接拒绝，不落盘） */
    public static final long ASR_AUDIO_MAX_BYTES = 10L * 1024 * 1024;
    public static final int ASR_AUDIO_MAX_SECONDS = 300;

    /* ==================== 通知场景（钉钉投递登记用，与 notify scenario 同源） ==================== */

    public static final String SCENARIO_REPORT_PUBLISHED = "cpm-report-published";
    public static final String SCENARIO_REPORT_DEADLINE_REMIND = "cpm-report-remind";
    public static final String SCENARIO_RECOGNITION_GRANTED = "cpm-recognition-granted";

    /* ==================== sys_config / 规则键前缀 ==================== */

    /** 汇报规则单行槽位（对齐 rdm_daily_report_config 先例：唯一键保证全表一行） */
    public static final String RULE_SLOT_DEFAULT = "default";
}
