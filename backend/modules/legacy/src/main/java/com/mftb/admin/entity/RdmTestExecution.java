package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 测试执行记录实体
 */
@Data
@TableName("rdm_test_execution")
public class RdmTestExecution {

    @TableId
    private Long id;

    /** 批次ID */
    private Long batchId;

    /** 交付项ID */
    private Long deliveryItemId;

    /** 用例标题 */
    private String caseTitle;

    /** 执行人ID */
    private Long executorUserId;

    /** 执行人姓名 */
    private String executorUserName;

    /** 构建标识 */
    private String buildId;

    /** 测试环境 */
    private String testEnv;

    /** 结果:pass/fail/blocked/skip */
    private String result;

    /** 执行时间 */
    private LocalDateTime executedAt;

    /** 备注 */
    private String remark;

    /** 轮次 */
    private Integer roundNo;

    /* ==================== Batch 3 补列（rdm:schema:v3.2 / 237） ==================== */

    /** 稳定用例ID（旧记录不回填）；与冻结轮次的用例集合对齐 */
    private String caseId;

    /** 不可变测试轮次事实ID（引用 rdm_test_round） */
    private Long testRoundId;

    /** 业务范围版本（执行时对应的范围），非并发版本 */
    private Integer scopeVersion;

    /** 执行证据JSON */
    private String evidenceJson;

    /** 幂等请求ID */
    private String requestId;
}
