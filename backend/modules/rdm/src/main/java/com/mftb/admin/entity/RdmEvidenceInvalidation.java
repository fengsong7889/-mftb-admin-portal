package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 范围变更证据失效记录实体（Batch 2 / Phase 1A）。
 * <p>交付项范围版本变更（scope_version+1）后，旧的测试批次/验收记录/发布检查都基于旧范围，
 * 不删除（保留留痕），而是显式登记一条「因范围变更而失效」的记录，
 * 避免旧证据被当作当前范围的质量凭证。
 */
@Data
@TableName("rdm_evidence_invalidation")
public class RdmEvidenceInvalidation {

    /** 证据类型：提测批次 */
    public static final String TYPE_TEST_BATCH = "test_batch";
    /** 证据类型：验收记录 */
    public static final String TYPE_ACCEPTANCE = "acceptance";
    /** 证据类型：发布检查 */
    public static final String TYPE_RELEASE_CHECK = "release_check";

    @TableId
    private Long id;

    /** 交付项ID */
    private Long deliveryItemId;

    /** 证据类型:test_batch/acceptance/release_check */
    private String evidenceType;

    /** 证据记录ID */
    private Long evidenceId;

    /** 旧范围版本 */
    private Integer oldScopeVersion;

    /** 新范围版本 */
    private Integer newScopeVersion;

    /** 失效时间 */
    private LocalDateTime invalidatedAt;

    /** 操作人 */
    private Long invalidatedBy;

    /** 失效原因 */
    private String reason;
}
