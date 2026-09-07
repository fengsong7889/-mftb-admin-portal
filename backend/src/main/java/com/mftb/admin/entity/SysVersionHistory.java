package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 版本发布历史记录
 */
@Data
@TableName("sys_version_history")
public class SysVersionHistory {

    @TableId
    private Long id;

    /** 版本号 (Semantic Versioning, 如 1.0.0) */
    private String versionNo;

    /** 发布日期 */
    private LocalDate releaseDate;

    /** 发布类型: major/minor/patch */
    private String releaseType;

    /** 版本概要说明 */
    private String summary;

    /** 前端更新内容 (每行一条) */
    private String frontendChanges;

    /** 后端更新内容 (每行一条) */
    private String backendChanges;

    /** 数据库变更内容 (每行一条) */
    private String databaseChanges;

    /** 同步覆盖的最新 Git commit SHA（用于增量同步） */
    private String commitHash;

    /** 状态: 1=已发布 2=草稿 */
    private Integer status;

    private String createdBy;

    private String updatedBy;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
