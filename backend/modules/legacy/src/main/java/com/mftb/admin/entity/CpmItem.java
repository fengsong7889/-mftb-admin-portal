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
