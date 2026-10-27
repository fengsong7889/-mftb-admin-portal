package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 不可变测试轮次实体（Batch 3 / rdm:schema:v3.2，对应 237_rdm_batch3_test_release.sql）。
 * <p>一轮提测受理后冻结为一条不可变事实：范围快照、构建映射、用例集合、执行人与冻结证据哈希。
 * 后续测试执行（{@link RdmTestExecution}）以 {@code test_round_id} 引用本轮次，
 * 「已通过用例集合」以本表冻结的 {@code case_snapshot_json} 为准，不随草稿变化。
 * <p>追加式事实，无 version/updated_at；轮次号 {@code round_no} 是业务轮次，不是并发版本。
 */
@Data
@TableName("rdm_test_round")
public class RdmTestRound {

    @TableId
    private Long id;

    /** 所属提测批次ID */
    private Long batchId;

    /** 业务轮次号（同批次内递增，>0），非并发版本 */
    private Integer roundNo;

    /** 范围快照JSON：交付项 + scopeVersion + PRD + 标准快照 */
    private String scopeSnapshotJson;

    /** 构建映射JSON：交付项 + 系统 + 构建 */
    private String buildMappingJson;

    /** 测试环境 */
    private String testEnv;

    /** 用例快照JSON：交付项 + 稳定 caseId + 标题 + mandatory 冻结集合 */
    private String caseSnapshotJson;

    /** 执行人ID列表JSON */
    private String executorUserIdsJson;

    /** 冻结时间 */
    private LocalDateTime frozenAt;

    /** 冻结人（认证 SysUser.id） */
    private Long frozenBy;

    /** 冻结证据哈希 CHAR(64) */
    private String evidenceHash;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
