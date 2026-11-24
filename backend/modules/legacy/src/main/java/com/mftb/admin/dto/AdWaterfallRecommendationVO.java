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
import java.util.List;

/** 瀑布流相似推荐场景绑定视图；未配置时 configured=false 且 enabled=0。 */
@Data
public class AdWaterfallRecommendationVO {
    private boolean configured;
    private Long id;
    private Long waterfallId;
    private Integer sceneCode;
    private Long algorithmId;
    private Long algorithmRevisionId;
    private Integer revisionNo;
    private String algorithmName;
    private Integer enabled;
    private Integer candidateScope;
    private Integer businessType;
    private Integer bizChannel;
    private Long version;
    private List<Long> trafficAlgorithmIds;
    private String updatedBy;
    private LocalDateTime updatedAt;

    public static AdWaterfallRecommendationVO empty(Long waterfallId) {
        AdWaterfallRecommendationVO vo = new AdWaterfallRecommendationVO();
        vo.setConfigured(false);
        vo.setWaterfallId(waterfallId);
        vo.setSceneCode(1);
        vo.setEnabled(0);
        vo.setCandidateScope(1);
        vo.setVersion(0L);
        vo.setTrafficAlgorithmIds(List.of());
        return vo;
    }
}
