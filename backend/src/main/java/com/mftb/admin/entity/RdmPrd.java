package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * RDM 产品需求（PRD，L2）实体：一条业务需求可拆多份 PRD，支持逐级拆解。
 */
@Data
@TableName("rdm_prd")
public class RdmPrd {

    @TableId
    private Long id;

    /** PRD 编号 PRD+YYYYMMDD+4位 */
    private String prdNo;

    /** 所属业务需求 */
    private Long reqId;

    /** 父 PRD（逐级拆解） */
    private Long parentPrdId;

    /** 标题 */
    private String title;

    /** 目标用户与场景 */
    private String targetUsers;

    /** 功能清单 */
    private String featureList;

    /** 验收标准（逐条可验证） */
    private String acceptanceCriteria;

    /** 正文（富文本） */
    private String contentRich;

    /** 原型/设计稿链接 */
    private String prototypeUrl;

    /** 状态: draft/reviewing/approved/rejected/archived */
    private String status;

    /** 文档版本 */
    private String versionNo;

    /** 编写人（产品经理）ID */
    private Long authorUserId;

    /** 编写人姓名 */
    private String authorName;

    /** 评审完成时间 */
    private LocalDateTime reviewTime;

    /** 评审结论 */
    private String reviewConclusion;

    private String createdBy;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
