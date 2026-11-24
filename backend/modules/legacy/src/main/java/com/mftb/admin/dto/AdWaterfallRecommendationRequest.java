/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/** 瀑布流相似推荐场景绑定请求；业务范围由服务端对照算法与瀑布流复核。 */
@Data
public class AdWaterfallRecommendationRequest {
    @NotNull(message = "場景不能為空")
    @Min(1) @Max(3)
    private Integer sceneCode;
    /** 引用的不可变版本主键；仅停用既有绑定时可为空 */
    private Long algorithmRevisionId;
    @NotNull(message = "啟用狀態不能為空")
    @Min(0) @Max(1)
    private Integer enabled;
    @NotNull(message = "候選範圍不能為空")
    @Min(1) @Max(2)
    private Integer candidateScope;
    @NotNull(message = "業務類型不能為空")
    @Min(1) @Max(2)
    private Integer businessType;
    @NotNull(message = "業務頻道不能為空")
    @Min(1) @Max(3)
    private Integer bizChannel;
    /** 仅投流候选时必须的允许投流算法主键集合（type15） */
    private List<Long> trafficAlgorithmIds;
    /** 乐观锁期望版本；新建绑定传空 */
    private Long expectedVersion;
}
