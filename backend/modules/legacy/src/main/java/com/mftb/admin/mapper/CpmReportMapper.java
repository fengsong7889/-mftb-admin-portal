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
            + "content_json = #{contentJson}, summary = #{summary}, ai_summary = #{aiSummary}, "
            + "draft_hash = #{draftHash}, version = version + 1 "
            + "WHERE id = #{id} AND status = 'draft' AND deleted = 0")
    int publishDraft(@Param("id") long id, @Param("contentJson") String contentJson,
                     @Param("summary") String summary, @Param("aiSummary") int aiSummary,
                     @Param("draftHash") String draftHash);

    /**
     * 修订重发布：把已发布内容换成新冻结快照并推进版本指针。
     *
     * <p>WHERE 同时要求 status='published' 且 version 未变：与草稿覆盖同一条乐观锁思路。
     * 只有 {@code published} 才走这条，草稿仍必须走 publishDraft，否则「保存草稿」和
     * 「修订发布」两条路会写出同一状态而只有一条留下版本行，取证链当场断掉。
     */
    @Update("UPDATE biz_cpm_report SET content_json = #{contentJson}, summary = #{summary}, "
            + "ai_summary = #{aiSummary}, draft_hash = #{draftHash}, "
            + "published_revision_id = #{revisionId}, published_at = #{publishedAt}, "
            + "version = version + 1, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND status = 'published' "
            + "AND version = #{version} AND deleted = 0")
    int applyRevision(@Param("id") long id, @Param("userId") long userId, @Param("version") int version,
                      @Param("contentJson") String contentJson, @Param("summary") String summary,
                      @Param("aiSummary") int aiSummary, @Param("draftHash") String draftHash,
                      @Param("revisionId") Long revisionId, @Param("publishedAt") java.time.LocalDateTime publishedAt);

    /**
     * 首次发布后绑定版本指针。
     *
     * <p>指针必须在版本行插入之后写，所以不能并进 publishDraft 那一条 UPDATE；
     * 反过来如果先写指针再插版本行，中途失败就会留下「指向不存在的 V1」这种比 NULL 更糟的状态。
     */
    @Update("UPDATE biz_cpm_report SET published_revision_id = #{revisionId}, updated_at = NOW() "
            + "WHERE id = #{id} AND status = 'published' AND deleted = 0")
    int bindRevision(@Param("id") long id, @Param("revisionId") Long revisionId);

    /** 草稿覆盖：只允许覆盖自己的草稿（user_id 进 WHERE）。 */
    @Update("UPDATE biz_cpm_report SET content_json = #{contentJson}, summary = #{summary}, "
            + "ai_summary = #{aiSummary}, period_end = #{periodEnd}, version = version + 1, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND status = 'draft' AND deleted = 0")
    int overwriteDraft(@Param("id") long id, @Param("userId") long userId,
                       @Param("contentJson") String contentJson, @Param("summary") String summary,
                       @Param("aiSummary") int aiSummary, @Param("periodEnd") LocalDate periodEnd);

    @Select("SELECT * FROM biz_cpm_report WHERE id = #{id} AND deleted = 0")
    CpmReport selectAliveById(@Param("id") long id);

    /**
     * 加行锁取汇报（只在会产生新版本的写入路径上用：发布 / 修订重发布）。
     *
     * <p>为什么必须锁：版本落库前有一句「按 request_key 查是否已存在」的 SELECT，查不到行时
     * InnoDB 会在该唯一索引区间加 **间隙锁**；并发修订的两条事务各拿到互相兼容的间隙 S 锁，
     * 随后各自 INSERT 到同一段间隙 → 互等对方释放 → {@code DeadlockLoserDataAccessException}
     * （并发修订集成测试实测复现）。先锁汇报行，版本号分配与间隙检查就按汇报串行化，
     * 顺带消灭「两个线程各自算出 next=2，只有一边活下来」这种靠回读掩盖的争用。
     */
    @Select("SELECT * FROM biz_cpm_report WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    CpmReport selectAliveForUpdate(@Param("id") long id);

    /** 催办扫描：本期尚无已发布汇报的人（缺行即未交，SQL 侧圈定候选，服务层再按可见范围过滤）。 */
    @Select("SELECT u.id FROM sys_user u "
            + "WHERE u.deleted = 0 AND u.status = 1 AND u.role <> 'admin' "
            + "AND NOT EXISTS (SELECT 1 FROM biz_cpm_report r WHERE r.user_id = u.id AND r.deleted = 0 "
            + "AND r.status = 'published' AND r.period_type = #{periodType} AND r.period_start = #{periodStart})")
    List<Long> listUsersWithoutPublished(@Param("periodType") String periodType,
                                         @Param("periodStart") LocalDate periodStart);
}
