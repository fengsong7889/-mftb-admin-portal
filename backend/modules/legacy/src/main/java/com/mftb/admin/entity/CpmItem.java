/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * CPM 工作条目（事实原子）。
 *
 * <p>与进度流水的分工：本表的 status/progress 是「最新缓存」，轨迹真源在
 * {@code biz_cpm_item_update}；汇报聚合的期末状态一律从流水收敛后再回写本表，
 * 两套口径同时生效必然漂移（纪要事项同法）。done 时 progress 由服务端强制 100。
 *
 * <p>source_ref 与 (user_id, source_type) 组成软删感知唯一键：同一个 RDM 需求/
 * 会议行动项对同一个人只能长出一条记录，重复导入被数据库拒绝而不是靠前端按钮防抖。
 */
@Data
@TableName("biz_cpm_item")
public class CpmItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 归属人 sys_user.id：一律服务端由 JWT 注入，请求体没有身份字段的位置 */
    private Long userId;

    /** 首次记录日（业务时区 Asia/Shanghai） */
    private LocalDate workDate;

    private String title;

    private String detail;

    /** 分类键，取值域=当前岗位模板词表（服务端白名单校验） */
    private String category;

    /** todo/doing/done/blocked（CpmConstants.STATUS_*） */
    private String status;

    private Integer progress;

    /** 投入工时（小时）：仅分布统计，禁止进评价口径（工时≠绩效） */
    private BigDecimal workHours;

    /** manual/ai/rdm_requirement/meeting_action */
    private String sourceType;

    private String sourceRef;

    /** 来源对象标题快照：外部对象改名不得改写历史展示的口径 */
    private String sourceLabel;

    /** 记录时所用岗位模板键快照 */
    private String templateKey;

    /** 预留：OKR/目标挂点，本期服务端不读取 */
    private Long targetId;

    /* ---------- 阶段三：时间维度（全部由时段表回算，界面与接口都不手填） ---------- */

    /** 首次开工时点 = MIN(work_date + start_time) */
    private LocalDateTime firstStartAt;

    /** 最近收工时点 = MAX(work_date + end_time)，跨夜段折算到次日 */
    private LocalDateTime lastEndAt;

    /**
     * 工时来源：segment=时段回算，manual=手工快填。
     *
     * <p>为什么要单独存这一列：两种口径精度不同，汇报里的「总投入」必须能拆出
     * 哪几项只是估算；没有这一列就只能把两种精度混成一个数字假装同源。
     */
    private String workHoursSource;

    /* ---------- 阶段三：RDM 任务级关联与进度回写 ---------- */

    /** 回写目标 rdm_work_task.id；需求级关联为 null（没有可写的进度真值） */
    private Long rdmTaskId;

    /** 1=允许把本条目进度回写 RDM */
    private Integer rdmSyncEnabled;

    /** pending/success/conflict/rejected/error */
    private String rdmSyncState;

    /** RDM 返回的原文案，界面如实回显（含拒绝原因与冲突时的当前进度） */
    private String rdmSyncMessage;

    private LocalDateTime rdmSyncedAt;

    /**
     * 上次已知的 RDM 进度，回写时作为 expectedProgress。
     *
     * <p>缺这一列就只能「无条件覆盖」，别人在 RDM 甘特图上刚报的进度会被我这边的
     * 一次记录悄悄顶掉——RDM 的乐观锁本来就靠这个值生效。
     */
    private Integer rdmProgressSeen;

    /* ---------- 台账（cpm:schema:v1.3）：工作項归属 / 计划排期 / 计划属性 / 富文本备注 ---------- */

    /**
     * 所属工作項 biz_cpm_worklog_group.id；NULL=未分组（旧的日报流水条目）。
     *
     * <p>台账读取时未分组的条目会汇到一个虚拟分组里展示，而不是藏起来：
     * 只按分组过滤会让「昨天快捷录入的一行」在页面上凭空消失，
     * 用户看到的就是「记了但没了」，比多一个分组更糟。
     */
    private Long groupId;

    /**
     * 计划起日（甘特条左端）。
     *
     * <p>不复用 first_start_at/last_end_at：那两列由投入时段回算，语义是
     * 「实际什么时候干了」；用它画计划条会把还没开始的任务显示成已经干过。
     */
    private LocalDate planStart;

    /** 计划止日（甘特条右端） */
    private LocalDate planEnd;

    /** planned=原计划 / inserted=计划冻结后临时插入（周会要单独能念出来） */
    private String planType;

    /** 标记为临时插入的日期；原计划为 NULL */
    private LocalDate insertedAt;

    /**
     * 备注富文本（服务端白名单净化后入库）。
     *
     * <p>与 detail 分开：detail 是日报正文的纯文本说明，note 是台账行内的排版备注，
     * 两者出口不同（备注会进导出与推送），混成一列就会把标签带进纯文本场景。
     */
    private String noteHtml;

    /** 备注纯文本降级：搜索、Markdown 导出、CSV 用它，保证「导出文本 = 页面文本」 */
    private String noteText;

    /** 乐观锁：并发双端更新只有一边能赢 */
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    private Integer deleted;
}
