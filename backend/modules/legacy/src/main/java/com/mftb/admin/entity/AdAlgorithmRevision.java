/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 算法不可变版本实体（交互式相似推荐 type17 发布快照）。
 * <p>快照只允许插入与读取；运行侧读取绑定版本，编辑当前参数不会改变已发布版本。
 */
@Data
@TableName("biz_ad_algorithm_revision")
public class AdAlgorithmRevision {

    @TableId
    private Long id;

    /** 算法主键（biz_ad_algorithm.id） */
    private Long algorithmId;

    /** 算法内版本序号，从 1 递增 */
    private Integer revision;

    /** 参数协议版本 */
    private Integer schemaVersion;

    /** 不可变参数快照（JSON 字符串） */
    private String paramsSnapshot;

    /** 规范化快照摘要（SHA-256） */
    private String contentHash;

    /** 发布人 */
    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
