package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * RDM 交付项实体
 */
@Data
@TableName("rdm_delivery_item")
public class RdmDeliveryItem {

    @TableId
    private Long id;

    /** 交付项编号 */
    private String itemNo;

    /** 关联需求ID */
    private Long reqId;

    /** 关联项目ID */
    private Long projectId;

    /** 交付项标题 */
    private String title;

    /** 范围描述 */
    private String scopeDesc;

    /** 验收标准 */
    private String acceptanceCriteria;

    /** 范围版本号 */
    private Integer scopeVersion;

    /** 范围冻结时间（Batch 2）：非空表示范围已冻结，修改须走范围变更流程 */
    private LocalDateTime scopeFrozenAt;

    /** 范围冻结人（Batch 2） */
    private Long scopeFrozenBy;

    /** 范围变更日志（Batch 2，JSON 数组文本） */
    private String scopeChangeLog;

    /** PRD快照ID */
    private Long prdSnapshotId;

    /** 协调人用户ID */
    private Long coordinatorUserId;

    /** 协调人姓名 */
    private String coordinatorUserName;

    /** 产品验收人ID */
    private Long productAcceptorUserId;

    /** 产品验收人姓名 */
    private String productAcceptorUserName;

    /** 业务验收人ID */
    private Long bizAcceptorUserId;

    /** 业务验收人姓名 */
    private String bizAcceptorUserName;

    /** 验收路径A/B */
    private String acceptancePath;

    /** 计划开始 */
    private LocalDate planStartDate;

    /** 计划结束 */
    private LocalDate planEndDate;

    /** 状态 */
    private String status;

    /** 阻塞标记 */
    private Integer blockedFlag;

    /** 乐观锁 */
    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
