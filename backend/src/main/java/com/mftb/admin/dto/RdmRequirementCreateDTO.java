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
