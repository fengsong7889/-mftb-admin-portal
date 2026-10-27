package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM PRD 定稿快照实体（阶段 3：评审结论绑定的内容版本）.
 * <p>没有它时「评审通过」只代表某个时刻为真，之后正文仍可被改，
 * 于是开发按新内容做、验收按旧标准查，追溯链直接断在「谁看到的哪一版」。
 */
@Data
@TableName("rdm_prd_snapshot")
public class RdmPrdSnapshot {

    @TableId
    private Long id;

    /** PRD ID */
    private Long prdId;

    /** 需求ID */
    private Long reqId;

    /** 版本号快照，如 v1.2 */
    private String versionNo;

    /** 标题快照 */
    private String title;

    /** 功能清单快照 */
    private String featureList;

    /** 验收标准快照（验收用例的来源） */
    private String acceptanceCriteria;

    /** 正文快照 */
    private String contentRich;

    /** 原型链接快照 */
    private String prototypeUrl;

    /** 产生本快照的评审记录 */
    private Long reviewId;

    /** passed/rejected */
    private String conclusion;

    /** 评审意见摘要 */
    private String conclusionDesc;

    /** 评审参与人ID列表（逗号分隔） */
    private String reviewerIds;

    /** 定稿时间 */
    private LocalDateTime snapshotTime;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
