/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmReport;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;
import java.util.List;

/** CPM 汇报访问（每人每期一份由唯一键保证，upsert 语义在服务层两步写）。 */
@Mapper
public interface CpmReportMapper extends BaseMapper<CpmReport> {

    @Select("SELECT * FROM biz_cpm_report WHERE user_id = #{userId} AND period_type = #{periodType} "
            + "AND period_start = #{periodStart} AND deleted = 0 LIMIT 1")
    CpmReport findOwn(@Param("userId") long userId, @Param("periodType") String periodType,
                      @Param("periodStart") LocalDate periodStart);

    /** 团队视图：一批人在某周期内的全部汇报（已发布/草稿都返回，未提交=缺行，由服务层补「未交」）。 */
    @Select("<script>SELECT * FROM biz_cpm_report WHERE deleted = 0 AND period_type = #{periodType} "
            + "AND period_start = #{periodStart} AND user_id IN "
            + "<foreach item='id' collection='userIds' open='(' separator=',' close=')'>#{id}</foreach></script>")
    List<CpmReport> listByUsersAndPeriod(@Param("userIds") List<Long> userIds,
                                         @Param("periodType") String periodType,
                                         @Param("periodStart") LocalDate periodStart);

    /** 发布：仅草稿能翻正（条件 UPDATE，重复点发布=0 行=幂等成功，不会二次触发推送）。 */
    @Update("UPDATE biz_cpm_report SET status = 'published', published_at = NOW(), "
            + "content_json = #{contentJson}, summary = #{summary}, ai_summary = #{aiSummary}, version = version + 1 "
            + "WHERE id = #{id} AND status = 'draft' AND deleted = 0")
    int publishDraft(@Param("id") long id, @Param("contentJson") String contentJson,
                     @Param("summary") String summary, @Param("aiSummary") int aiSummary);

    /** 草稿覆盖：只允许覆盖自己的草稿（user_id 进 WHERE）。 */
    @Update("UPDATE biz_cpm_report SET content_json = #{contentJson}, summary = #{summary}, "
            + "ai_summary = #{aiSummary}, period_end = #{periodEnd}, version = version + 1, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND status = 'draft' AND deleted = 0")
    int overwriteDraft(@Param("id") long id, @Param("userId") long userId,
                       @Param("contentJson") String contentJson, @Param("summary") String summary,
                       @Param("aiSummary") int aiSummary, @Param("periodEnd") LocalDate periodEnd);

    @Select("SELECT * FROM biz_cpm_report WHERE id = #{id} AND deleted = 0")
    CpmReport selectAliveById(@Param("id") long id);

    /** 催办扫描：本期尚无已发布汇报的人（缺行即未交，SQL 侧圈定候选，服务层再按可见范围过滤）。 */
    @Select("SELECT u.id FROM sys_user u "
            + "WHERE u.deleted = 0 AND u.status = 1 AND u.role <> 'admin' "
            + "AND NOT EXISTS (SELECT 1 FROM biz_cpm_report r WHERE r.user_id = u.id AND r.deleted = 0 "
            + "AND r.status = 'published' AND r.period_type = #{periodType} AND r.period_start = #{periodStart})")
    List<Long> listUsersWithoutPublished(@Param("periodType") String periodType,
                                         @Param("periodStart") LocalDate periodStart);
}
