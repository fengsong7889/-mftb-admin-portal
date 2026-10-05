package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 验收用例明细（M3）
 * <p>一条验收单据下的逐条验证记录。用例来源优先为 PRD 的验收标准，
 * 目的是让「验收通过」必须有可核对的证据，而不是一个主观勾选。
 * <p>result 为 fail 时 severity 必填：致命/严重缺陷会阻断「有条件通过」，
 * 避免带病上线把缺陷转移到业务侧。
 */
@Data
@TableName("rdm_acceptance_case")
public class RdmAcceptanceCase {

    @TableId
    private Long id;

    /** 验收单ID */
    private Long acceptanceId;

    /** 需求ID（冗余，便于按需求聚合缺陷数） */
    private Long reqId;

    /** 用例序号 */
    private Integer seq;

    /** 用例名称（来源 PRD 验收标准） */
    private String title;

    /** 预期结果 */
    private String expectResult;

    /** 实际结果 */
    private String actualResult;

    /** 用例结论: pass/fail/blocked */
    private String result;

    /** 缺陷严重度: critical/major/minor/trivial */
    private String severity;

    /** 备注 */
    private String remark;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
