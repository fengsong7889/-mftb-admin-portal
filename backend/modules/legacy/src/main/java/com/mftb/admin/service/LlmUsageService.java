package com.mftb.admin.service;

import com.mftb.admin.dto.LlmUsageRecordRequest;
import com.mftb.admin.dto.LlmUsageRecordVO;
import com.mftb.admin.dto.LlmUsageSummaryVO;
import com.mftb.admin.dto.PageResult;

import java.time.LocalDate;

/**
 * AI 助手使用统计服务
 * 明细由开发环境 LLM 代理回传落库，汇总按查询范围实时聚合（不建汇总表）
 */
public interface LlmUsageService {

    /**
     * 记录一次 LLM 调用用量（费用按当前单价配置现算后快照入库）
     *
     * @param username 使用账号（必须取自 JWT，不接受客户端传入）
     * @param request  用量数据
     */
    void record(String username, LlmUsageRecordRequest request);

    /**
     * 查询范围内的实时汇总（总量 / 按模型 / 按用户，金额按币种分组）
     *
     * @param startDate 起始日期（含）
     * @param endDate   结束日期（含）
     * @param username  可选账号过滤
     */
    LlmUsageSummaryVO summary(LocalDate startDate, LocalDate endDate, String username);

    /**
     * 分页查询用量明细（按时间倒序，行内附带员工姓名/工号）
     */
    PageResult<LlmUsageRecordVO> records(long page, long size, String username, LocalDate startDate, LocalDate endDate);
}
