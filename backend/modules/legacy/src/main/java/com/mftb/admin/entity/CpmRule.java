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

import java.time.LocalDateTime;

/**
 * CPM 汇报规则（全局单行：rule_slot 恒 'default'，唯一键保证全表一行）。
 * <p>为什么单行：一期不做部门级差异化（rdm_daily_report_config 也是先单行、
 * 被真实需求逼出多规则后才拆表——提前拆是过度设计）。作业每轮读本行决定
 * 催办时间与接收人策略；改后即时生效，无需重启。
 */
@Data
@TableName("biz_cpm_rule")
public class CpmRule {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 恒 'default'（唯一键兜底「作业读到哪一行」的口径分裂） */
    private String ruleSlot;

    /** 总开关：0=提醒与推送全停（催办属于写侧治理，开关误开比功能不生效更糟） */
    private Integer enabled;

    /** 启用的周期集合 JSON 数组，如 ["week"] */
    private String periodTypesJson;

    /** 周报截止星期 1-7（周一=1） */
    private Integer deadlineDay;

    /** 截止时刻 HH:mm */
    private String deadlineTime;

    /** 截止前多少小时催办（同日去重由 push_record 唯一键保证） */
    private Integer remindBeforeHours;

    /** 接收人=直属上级（部门主管关系推导） */
    private Integer receiverManager;

    /** 追加接收人 sys_user.id，前后带逗号：,12,35, */
    private String extraReceiverIds;

    /** 群报卡片开关（仅摘要+站内链接，正文站内鉴权） */
    private Integer groupPush;

    /** 个人工作通知开关 */
    private Integer personalPush;

    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
