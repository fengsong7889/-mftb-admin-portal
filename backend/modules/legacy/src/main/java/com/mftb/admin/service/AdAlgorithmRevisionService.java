/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service;

import com.mftb.admin.dto.AdAlgorithmRevisionVO;

import java.util.List;

/** 算法不可变版本服务（交互式相似推荐） */
public interface AdAlgorithmRevisionService {

    /** 基于算法当前参数发布新版本；expectedRevision 非空时与当前最大版本比对，不一致返回 409 */
    AdAlgorithmRevisionVO publish(Long algorithmId, Integer expectedRevision);

    /** 版本列表（倒序） */
    List<AdAlgorithmRevisionVO> list(Long algorithmId);
}
