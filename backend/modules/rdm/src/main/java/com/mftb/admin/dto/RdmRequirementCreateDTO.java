package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 需求提交/编辑请求体
 */
@Data
public class RdmRequirementCreateDTO {

    /** 需求标题 */
    private String title;

    /** 需求类型 */
    private String reqType;

    /** 优先级 */
    private String priority;

    /** 规模（可由产品评估回填） */
    private String complexity;

    /** 期望完成日期 yyyy-MM-dd */
    private String expectDate;

    /** 现状与痛点 */
    private String description;

    /** 期望结果 */
    private String expectResult;

    /** 业务价值 */
    private String businessValue;

    /** 需求关联对象（可多个） */
    private List<Target> targets;

    /** PM=直接指定产品经理；POOL=提交技术部统一分配 */
    private String assignMode;

    /** 指定产品经理ID */
    private Long pmUserId;

    /**
     * 技术负责人ID（仅 assignMode=POOL 时生效）。
     * <p>提出人往往知道「该找哪位技术负责人」但不知道具体产品经理；
     * 先选定负责人，需求池里的「當前處理人」才能是一个真实的人，而不是角色名。
     */
    private Long dispatcherUserId;

    /** 是否需要准入审批（管理岗或规则命中时由后端覆盖） */
    private Boolean needApproval;

    /** 业务验收人ID（不传默认提出人本人） */
    private Long acceptorUserId;

    /** 抄送人ID列表 */
    private List<Long> ccUserIds;

    /** 附件 */
    private List<Attachment> attachments;

    /** 提交模式: draft=存草稿，其它值按正式提交处理 */
    private String mode;

    /* ==================== V3 分层链路（Batch 2 / Phase 2） ==================== */

    /**
     * 流程版本：缺省按 V2 新链路；显式传 3 走 V3 分层并行链路。
     * <p>V3 下创建成功后自动生成默认交付项，并支持挂结构父需求。不接受客户端任意值，
     * 服务端只认 {@code 3} 与非 3（回落 V2），避免伪造版本号绕过闸门口径。
     */
    private Integer flowVersion;

    /** 所属项目ID（V3 可在准入阶段后再关联，允许为空） */
    private Long projectId;

    /** 需求种类：aggregate（聚合）/ execution（执行）；V3 缺省 execution */
    private String requirementKind;

    /** 结构父需求ID（主子关系）；传入则创建后挂到该聚合需求下，服务层校验父需为 aggregate、无环、单父 */
    private Long structureParentReqId;

    /** 需求关联对象 */
    @Data
    public static class Target {
        /** 定位粒度 */
        private String anchorType;
        /** 系统编码 */
        private String systemCode;
        /** 菜单 key */
        private String menuKey;
        /** 页面路径 */
        private String pagePath;
        /** 定位对象名称 */
        private String anchorName;
        /** 定位补充说明 */
        private String anchorDesc;
        /** 截图（data URL 或存储路径） */
        private String screenshotUrl;
    }

    /** 附件项 */
    @Data
    public static class Attachment {
        private String fileName;
        private String storagePath;
        private String fileType;
        private Long fileSize;
    }
}
