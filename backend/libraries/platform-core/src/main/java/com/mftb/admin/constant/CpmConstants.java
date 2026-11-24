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
    /**
     * 節假日配置：工作記錄的工时口径页（日历点选节假日/補班/調休/請假）。
     * 单独成菜单而不是 cpm-my 的子页：它改的是「工时怎么算」这条全局口径，
     * 影响所有台账与汇报数字，值得在菜单上看得见、也能单独收回授权。
     */
    public static final String MENU_HOLIDAY = "cpm-holiday";

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
    /** 已取消：不再该做的事。留在待办里会把完成率压成与交付表现无关的数字 */
    public static final String STATUS_CANCELLED = "cancelled";
    /** 延期：改期了。与受阻是两种管理动作——一个要解阻，一个只需重排期 */
    public static final String STATUS_DEFERRED = "deferred";

    /**
     * 状态取值集合的唯一真源：白名单校验、SQL 期间过滤、以及 DDL 里 CHECK 的取值列表
     * 都从这里拼（同 {@code MeetingConstants.BIZ_TYPES} 的口径）。
     *
     * <p>为什么必须排序后拼接：DDL 与 Java 各写一份字面量时，加一个取值就漏改一处，
     * 后果是「界面点得出来、写库报數據庫操作異常」——阶段二踩过一次同类坑。
     */
    public static final java.util.SortedSet<String> ITEM_STATUSES =
            java.util.Collections.unmodifiableSortedSet(new java.util.TreeSet<>(java.util.Arrays.asList(
                    STATUS_TODO, STATUS_DOING, STATUS_DONE, STATUS_BLOCKED, STATUS_CANCELLED, STATUS_DEFERRED)));

    /** 完成率分母排除的状态：取消不是没做完，延期仍算（事还在，只是改了期） */
    public static final java.util.Set<String> STATUSES_EXCLUDED_FROM_COMPLETION =
            java.util.Collections.singleton(STATUS_CANCELLED);

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
    /**
     * RDM 任务级关联（阶段三新增）：只有任务级条目才具备进度回写的落点——
     * RDM 的进度真值在 {@code rdm_work_task.progress}，而 {@code rdm_requirement.progress}
     * 被 RDM 日报明确判为「可能长期停留 0，用它算会与甘特图矛盾」。
     * 因此需求级关联（{@link #SOURCE_RDM}）保持只读，不参与回写。
     */
    public static final String SOURCE_RDM_TASK = "rdm_task";
    public static final String SOURCE_MEETING_ACTION = "meeting_action";

    /** 来源取值集合唯一真源（同上：校验与 DDL CHECK 同源） */
    public static final java.util.SortedSet<String> SOURCE_TYPES =
            java.util.Collections.unmodifiableSortedSet(new java.util.TreeSet<>(java.util.Arrays.asList(
                    SOURCE_MANUAL, SOURCE_AI, SOURCE_RDM, SOURCE_RDM_TASK, SOURCE_MEETING_ACTION)));

    /* ==================== RDM 回写结果（biz_cpm_item.rdm_sync_state） ==================== */

    public static final String SYNC_PENDING = "pending";
    public static final String SYNC_SUCCESS = "success";
    /** RDM 侧进度已被他人改动：必须让本人看见并给出「重新對齊」出路，绝不静默覆盖交付真值 */
    public static final String SYNC_CONFLICT = "conflict";
    /** RDM 规则拒绝（PRD 只能走提交评审、完成缺交付说明、取消/延期无对应语义） */
    public static final String SYNC_REJECTED = "rejected";
    public static final String SYNC_ERROR = "error";

    public static final java.util.SortedSet<String> SYNC_STATES =
            java.util.Collections.unmodifiableSortedSet(new java.util.TreeSet<>(java.util.Arrays.asList(
                    SYNC_PENDING, SYNC_SUCCESS, SYNC_CONFLICT, SYNC_REJECTED, SYNC_ERROR)));

    /** 回写来源标识：写进 RDM 进度流水，让交付侧能看出这笔改动来自绩效记录 */
    public static final String SYNC_SOURCE = "cpm";

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
    /** 时段备注列宽（与 biz_cpm_time_entry.note VARCHAR(200) 同源） */
    public static final int TIME_NOTE_MAX = 200;
    /** 单段耗时上限（分钟）：与 ck_cpm_time_duration 同一约束值，一天不可能超过 24 小时 */
    public static final int MAX_DURATION_MINUTES = 1440;
    /** 单条目单日时段数上限：防「一秒一段」把工时统计刷成噪音 */
    public static final int TIME_ENTRIES_PER_ITEM_DAY_MAX = 20;
    /** 修订说明列宽（与 biz_cpm_report_revision.change_note 同源） */
    public static final int CHANGE_NOTE_MAX = 200;
    /** 回写结果文案列宽（与 biz_cpm_item.rdm_sync_message 同源） */
    public static final int SYNC_MESSAGE_MAX = 200;
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

    /* ==================== 台账：排期 / 计划属性 / 工时口径（cpm:schema:v1.3） ==================== */

    /** 每个工作日折算工时（小时）。界面、汇报、导出共用这一个常数；改它等于改所有人的周报数字 */
    public static final int WORKLOG_HOURS_PER_DAY = 8;

    /** 计划属性：期初已排期 */
    public static final String PLAN_TYPE_PLANNED = "planned";
    /** 计划属性：计划冻结后临时安排进来的工作，周会要单独能念出来 */
    public static final String PLAN_TYPE_INSERTED = "inserted";
    public static final java.util.SortedSet<String> PLAN_TYPES =
            java.util.Collections.unmodifiableSortedSet(new java.util.TreeSet<>(java.util.Arrays.asList(
                    PLAN_TYPE_PLANNED, PLAN_TYPE_INSERTED)));

    /** 日历类型：法定节假日，不计工时（全局名单） */
    public static final String DAY_TYPE_HOLIDAY = "holiday";
    /** 日历类型：周末上班，计工时（全局名单，唯一计入的例外） */
    public static final String DAY_TYPE_MAKEUP = "makeup";
    /** 日历类型：工作日换休，不计工时（本人名单） */
    public static final String DAY_TYPE_COMP_OFF = "comp_off";
    /** 日历类型：请假不在岗，不计工时（本人名单） */
    public static final String DAY_TYPE_LEAVE = "leave";
    public static final java.util.SortedSet<String> DAY_TYPES =
            java.util.Collections.unmodifiableSortedSet(new java.util.TreeSet<>(java.util.Arrays.asList(
                    DAY_TYPE_HOLIDAY, DAY_TYPE_MAKEUP, DAY_TYPE_COMP_OFF, DAY_TYPE_LEAVE)));

    /** 只有補班计入工时，其余三类都从工作日扣除——判定只在这里写一次 */
    public static boolean dayTypeCountsAsWork(String dayType) {
        return DAY_TYPE_MAKEUP.equals(dayType);
    }

    /** 全局法定名单（节假日/补班）；调休/请假属个人 */
    public static boolean dayTypeIsGlobal(String dayType) {
        return DAY_TYPE_HOLIDAY.equals(dayType) || DAY_TYPE_MAKEUP.equals(dayType);
    }

    /** 台账子任务的默认分类：台账界面不提供分类选择，写死 general 避免把用户输入当白名单绕过口 */
    public static final String LEDGER_CATEGORY = "general";

    /** 工作項色相下标上限（与前端 GROUP_COLORS 长度同源，超出即取模而不是报错） */
    public static final int GROUP_HUE_MAX = 6;
    /** 台账一次读取的最大天数：季报 92 天，留一倍余量；超限说明调用方在拉全量 */
    public static final int WORKLOG_RANGE_MAX_DAYS = 400;
    /** 一次性导入本地台账的上限（工作項数 / 单工作項子任务数） */
    public static final int IMPORT_GROUP_MAX = 100;
    public static final int IMPORT_TASK_MAX_PER_GROUP = 200;
}
