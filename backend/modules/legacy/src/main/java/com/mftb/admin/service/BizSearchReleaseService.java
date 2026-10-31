package com.mftb.admin.service;

import com.mftb.admin.entity.BizSearchRelease;

import java.util.List;

/**
 * 搜索配置发布版本服务。
 * <p>本服务管理版本的状态流转（草稿→待审→批准）；「发布至 ES 生效」需真实索引与实例确认（B1，依赖 ES），
 * 本批不提供伪生效接口，避免把「已批准」误当成「线上已加载」。
 */
public interface BizSearchReleaseService {

    List<BizSearchRelease> list(Integer status);

    long createDraft(BizSearchRelease release);

    void submitForReview(Long id);

    void approve(Long id, String approver);

    void delete(Long id);
}
