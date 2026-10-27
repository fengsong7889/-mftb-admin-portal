package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 显式项目灰度配置实体（Batch 4 / rdm:schema:v3.3，对应 238_rdm_batch4_migration.sql）。
 * <p>{@code scope_key} 约定：全局配置为字面量 {@code GLOBAL}（project_id 为 NULL）；
 * 项目级为 {@code PROJECT:<数字ID>}（project_id 与后缀一致）。由 {@code ck_rdm_flow_scope} 强约束。
 * <p>V3 写入与发布是**两个独立开关**（{@code v3_write_enabled} / {@code v3_release_enabled}），
 * 且**默认关闭**（种子仅写一条 GLOBAL、两开关均为 0）：读审计不受写熔断影响，
 * 全局暂停开关（{@code global_write_paused} / {@code global_release_paused}）只对 GLOBAL 行有意义。
 * <p>{@code version} 是并发控制版本（乐观锁），非业务范围版本。
 */
@Data
@TableName("rdm_flow_config")
public class RdmFlowConfig {

    @TableId
    private Long id;

    /** 作用域键：GLOBAL 或 PROJECT:数字ID */
    private String scopeKey;

    /** 项目ID（GLOBAL 行为 NULL） */
    private Long projectId;

    /** V3 写入开关（0/1，默认 0=关闭） */
    private Integer v3WriteEnabled;

    /** V3 发布开关（0/1，默认 0=关闭），与写入开关相互独立 */
    private Integer v3ReleaseEnabled;

    /** 全局写入暂停（0/1，仅 GLOBAL 行有效） */
    private Integer globalWritePaused;

    /** 全局发布暂停（0/1，仅 GLOBAL 行有效） */
    private Integer globalReleasePaused;

    /** 产品补验时限（天，>0） */
    private Integer productVerificationDays;

    /** 业务补验时限（天，>0） */
    private Integer businessVerificationDays;

    /** 并发控制版本（乐观锁），非业务范围版本 */
    @Version
    private Integer version;

    /** 最后更新人 */
    private Long updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
