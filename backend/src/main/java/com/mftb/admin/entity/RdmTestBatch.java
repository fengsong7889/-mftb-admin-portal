package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 提测批次实体
 */
@Data
@TableName("rdm_test_batch")
public class RdmTestBatch {

    @TableId
    private Long id;

    /** 提测批次号 */
    private String batchNo;

    /** 关联需求ID */
    private Long reqId;

    /** 交付项ID列表JSON */
    private String deliveryItemIdsJson;

    /** 范围快照JSON */
    private String scopeSnapshotJson;

    /** 构建标识列表JSON */
    private String buildIdsJson;

    /** 测试环境 */
    private String testEnv;

    /** 测试负责人ID */
    private Long testLeadUserId;

    /** 测试负责人姓名 */
    private String testLeadUserName;

    /** 执行人ID列表JSON */
    private String executorUserIdsJson;

    /** 计划结束时间 */
    private LocalDateTime planEndTime;

    /** 状态:pending/accepted/returned/executing/passed/failed */
    private String status;

    /** 轮次 */
    private Integer roundNo;

    /** 退回原因 */
    private String returnedReason;

    /** 申请人ID */
    private Long applicantUserId;

    /** 申请人姓名 */
    private String applicantUserName;

    /* ==================== Batch 3 补列（rdm:schema:v3.2 / 237） ==================== */

    /**
     * 并发控制版本（乐观锁），用于受理/执行/退回等状态推进的并发保护。
     * <p>注意：这是**并发版本**，既不是业务轮次 {@code roundNo}，也不是范围版本 scopeVersion，三者不可混用。
     */
    @Version
    private Integer version;

    /** 待接收用例草稿JSON；已冻结的权威用例集合以 rdm_test_round.case_snapshot_json 为准 */
    private String caseSnapshotJson;

    /** 待接收的交付项-系统-构建映射JSON */
    private String buildMappingJson;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
