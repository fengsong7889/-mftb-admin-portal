package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 版本发布历史记录 VO
 */
@Data
public class VersionHistoryVO {

    private Long id;

    /** 版本号 */
    private String versionNo;

    /** 发布日期 */
    private LocalDate releaseDate;

    /** 发布类型: major/minor/patch */
    private String releaseType;

    /** 版本概要说明 */
    private String summary;

    /** 前端更新内容 */
    private String frontendChanges;

    /** 后端更新内容 */
    private String backendChanges;

    /** 数据库变更内容 */
    private String databaseChanges;

    /** 状态: 1=已发布 2=草稿 */
    private Integer status;

    private String createdBy;

    private String updatedBy;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
