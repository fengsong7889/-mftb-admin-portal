/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;

/** 算法不可变版本视图 */
@Data
public class AdAlgorithmRevisionVO {
    private Long id;
    private Long algorithmId;
    private Integer revision;
    private Integer schemaVersion;
    private Map<String, Object> params;
    private String contentHash;
    private String createdBy;
    private LocalDateTime createdAt;
    /** 冗余展示字段：算法名称与品牌，避免列表二次查询 */
    private String algorithmName;
    private String brand;

    public static AdAlgorithmRevisionVO from(com.mftb.admin.entity.AdAlgorithmRevision entity) {
        AdAlgorithmRevisionVO vo = new AdAlgorithmRevisionVO();
        vo.setId(entity.getId());
        vo.setAlgorithmId(entity.getAlgorithmId());
        vo.setRevision(entity.getRevision());
        vo.setSchemaVersion(entity.getSchemaVersion());
        vo.setParams(com.mftb.admin.service.support.AdSimilarAlgorithmParams.read(entity.getParamsSnapshot()));
        vo.setContentHash(entity.getContentHash());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }
}
