/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.mftb.admin.dto.AdWaterfallRecommendationRequest;
import com.mftb.admin.dto.AdWaterfallRecommendationVO;

/** 瀑布流相似推荐场景绑定服务 */
public interface AdWaterfallRecommendationService {

    AdWaterfallRecommendationVO get(Long waterfallId);

    /** 整体替换场景绑定与允许投流集合；乐观锁冲突返回 409 */
    AdWaterfallRecommendationVO put(Long waterfallId, AdWaterfallRecommendationRequest request);

    /** 瀑布流删除时清理绑定（同事务调用） */
    void deleteByWaterfall(Long waterfallId);

    /** 算法是否仍被场景绑定引用（删除保护） */
    boolean isReferenced(Long algorithmId);
}
