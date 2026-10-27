package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 任务类型字典（业务可配置）。
 * <p>
 * 任务类型下拉选项/图例色/聚合桶/写校验四件事同源：新增类型（如 APP 拆 Android/iOS）
 * 只配本表即可；{@code code} 稳定唯一且永续（不提供物理删除，仅停用），
 * 保护 {@code rdm_work_task.task_type} 的历史引用。
 * <p>
 * {@code category} 三值决定聚合口径：design（设计桶）/ qa（测试桶）/ dev（研发桶，默认）。
 * 服务层对未知 category 一律按 dev 兜底，保证负载统计与工时归集永远落在三桶之一。
 * <p>
 * {@code company_id} 为多租户预留列，本期恒 NULL（全局集）；未来接入公司维度时
 * 查询口径升级为 {@code company_id IS NULL OR company_id = ?}。
 */
@Data
@TableName("rdm_task_type_config")
public class RdmTaskTypeConfig {

    /** 聚合桶：设计 */
    public static final String CATEGORY_DESIGN = "design";
    /** 聚合桶：测试 */
    public static final String CATEGORY_QA = "qa";
    /** 聚合桶：研发（默认兜底） */
    public static final String CATEGORY_DEV = "dev";

    /** 三值白名单（管理端下拉同源，避免前后端各维护一份） */
    public static final String[] CATEGORIES = {CATEGORY_DESIGN, CATEGORY_QA, CATEGORY_DEV};

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 稳定编码（唯一）：design/frontend/app/backend/qa/data，扩展如 android/ios */
    private String code;

    /** 显示名（繁体） */
    private String label;

    /** 图例/标签色 #RRGGBB */
    private String color;

    /** 聚合桶：design/qa/dev（默认 dev=研发） */
    private String category;

    /** 启用位：1=启用 0=停用（停用仅影响下拉展示，不影响存量任务解析） */
    private Integer enabled;

    /** 排序（升序） */
    private Integer sortOrder;

    /** 预留公司维度隔离，NULL=全局 */
    private Long companyId;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String createdBy;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
