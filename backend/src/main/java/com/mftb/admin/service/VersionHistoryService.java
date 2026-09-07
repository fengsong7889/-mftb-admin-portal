package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VersionHistoryVO;

import java.time.LocalDate;

/**
 * 版本发布历史记录服务
 */
public interface VersionHistoryService {

    /**
     * 分页查询版本记录
     */
    PageResult<VersionHistoryVO> list(long page, long size, String keyword, String releaseType,
                                      LocalDate startDate, LocalDate endDate, Integer status);

    /**
     * 按 ID 获取版本详情
     */
    VersionHistoryVO getById(Long id);

    /**
     * 新增版本记录
     */
    Long create(VersionHistoryVO vo, String operator);

    /**
     * 更新版本记录
     */
    void update(Long id, VersionHistoryVO vo, String operator);

    /**
     * 删除版本记录
     */
    void delete(Long id);

    /**
     * 从 Git 提交历史同步版本记录
     * @return 同步结果摘要
     */
    String syncFromGit(String operator);
}
