/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmAiExtraction;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

/**
 * CPM AI 提取台账访问。
 * <p>幂等与并发都靠数据库把守（与纪要提取同一套语义）：
 * uk(request_key) 同键重放命中已有行直接回原结果；终态推进一律是
 * 「WHERE status='processing'」的条件 UPDATE，影响 0 行=已被抢先处理，按幂等成功返回。
 */
@Mapper
public interface CpmAiExtractionMapper extends BaseMapper<CpmAiExtraction> {

    @Select("SELECT * FROM biz_cpm_ai_extraction WHERE request_key = #{requestKey} LIMIT 1")
    CpmAiExtraction findByRequest(@Param("requestKey") String requestKey);

    @Select("SELECT COUNT(*) FROM biz_cpm_ai_extraction WHERE user_id = #{userId} AND created_at >= #{since}")
    int countRecent(@Param("userId") long userId, @Param("since") LocalDateTime since);

    /** 处理中 → 成功：只有仍处理中的行能被落结果。 */
    @Update("UPDATE biz_cpm_ai_extraction SET status = 'succeeded', model_key = #{modelKey}, "
            + "result_json = #{resultJson}, usage_json = #{usageJson} "
            + "WHERE id = #{id} AND status = 'processing'")
    int markSucceeded(@Param("id") long id, @Param("modelKey") String modelKey,
                      @Param("resultJson") String resultJson, @Param("usageJson") String usageJson);

    /** 处理中 → 失败：只存错误码，不存堆栈（错误详情只进日志）。 */
    @Update("UPDATE biz_cpm_ai_extraction SET status = 'failed', error_code = #{errorCode} "
            + "WHERE id = #{id} AND status = 'processing'")
    int markFailed(@Param("id") long id, @Param("errorCode") String errorCode);

    /** 超时清扫：处理中但早于 cutoff 的行置 expired（服务重启/模型悬挂都靠这条收敛）。 */
    @Update("UPDATE biz_cpm_ai_extraction SET status = 'expired' "
            + "WHERE status = 'processing' AND updated_at < #{cutoff}")
    int expireStaleProcessing(@Param("cutoff") LocalDateTime cutoff);

    /** 敏感载荷限期清除：原文只作一次性载荷，终态超 7 天一律抹掉 payload_json。 */
    @Update("UPDATE biz_cpm_ai_extraction SET payload_json = NULL "
            + "WHERE status IN ('succeeded','failed','expired') AND payload_json IS NOT NULL "
            + "AND updated_at < #{before}")
    int clearExpiredPayloads(@Param("before") LocalDateTime before);
}
