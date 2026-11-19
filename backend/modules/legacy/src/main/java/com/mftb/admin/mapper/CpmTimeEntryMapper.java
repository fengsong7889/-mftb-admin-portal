/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmTimeEntry;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * CPM 投入时段访问。
 *
 * <p>所有聚合口径都在这里一次成型，服务层与前端不得再各自 SUM 一遍：
 * 「通知里的数字 = 页面数字 = 导出数字」靠的是只有一份算式。
 *
 * <p>每条读语句都带 {@code deleted = 0}：本域走显式 SQL 而不是 BaseMapper，
 * 逻辑删除条件不会被自动补上，漏一条就把已删时段算进工时。
 */
@Mapper
public interface CpmTimeEntryMapper extends BaseMapper<CpmTimeEntry> {

    /** 某人某区间的明细时段（汇报聚合与日视图共用一次取数，避免逐条目 N+1）。 */
    @Select("SELECT * FROM biz_cpm_time_entry WHERE user_id = #{userId} AND deleted = 0 "
            + "AND work_date >= #{start} AND work_date <= #{end} ORDER BY work_date, start_time, id")
    List<CpmTimeEntry> listByUserAndRange(@Param("userId") long userId,
                                          @Param("start") LocalDate start,
                                          @Param("end") LocalDate end);

    @Select("SELECT * FROM biz_cpm_time_entry WHERE item_id = #{itemId} AND deleted = 0 "
            + "ORDER BY work_date, start_time, id")
    List<CpmTimeEntry> listByItem(@Param("itemId") long itemId);

    /**
     * 条目级精确边界：回算 first_start_at / last_end_at 用。
     *
     * <p>这里<b>不</b>提供分类/按日/按事项的 SUM 方法，刻意的：汇报的工时汇总必须由
     * {@link com.mftb.admin.service.cpm.CpmSnapshotBuilder} 从<b>同一批已取回的明细行</b>算，
     * 而不是另发一条聚合 SQL。两条路径的过滤条件不可能永远一致——最典型的一处是
     * 「条目 work_date 在期间外、没有流水、却有一段期间内的时段」：
     * 聚合 SQL 会把它算进总数，条目清单里没有它，界面上就出现「合计 12h 但明细加起来只有 9h」。
     * 数字对不上时没人会去查两处 WHERE 的差异，只会说系统在骗人。
     */
    @Select("SELECT MIN(TIMESTAMP(work_date, start_time)) FROM biz_cpm_time_entry "
            + "WHERE item_id = #{itemId} AND deleted = 0 AND start_time IS NOT NULL")
    LocalDateTime firstStartOf(@Param("itemId") long itemId);

    /**
     * 最近收工时点：跨夜段的结束时刻属次日，故直接取 `work_date + duration` 推不出可靠时刻，
     * 这里按「结束时刻 + 跨夜标记」折算，MIN/MAX 一律用折算后的值，避免跨夜段被判成当天最早。
     */
    @Select("SELECT MAX(CASE WHEN crosses_midnight = 1 THEN TIMESTAMP(DATE_ADD(work_date, INTERVAL 1 DAY), end_time) "
            + "ELSE TIMESTAMP(work_date, end_time) END) FROM biz_cpm_time_entry "
            + "WHERE item_id = #{itemId} AND deleted = 0 AND end_time IS NOT NULL")
    LocalDateTime lastEndOf(@Param("itemId") long itemId);

    /** 当日该条目已有几段：给「一秒一段」的刷量设上限（界面与接口同一条约束值）。 */
    @Select("SELECT COUNT(*) FROM biz_cpm_time_entry WHERE item_id = #{itemId} AND work_date = #{date} AND deleted = 0")
    int countOnItemDate(@Param("itemId") long itemId, @Param("date") LocalDate date);

    /**
     * 归属人 + 版本同时进 WHERE：与 {@code CpmItemMapper.updateOwnedVersioned} 同一条防线。
     * 只判 version 的话，拿到别人 id 的请求仍能改到别人数据（乐观锁不是资源属主校验）。
     */
    @Update("UPDATE biz_cpm_time_entry SET work_date = #{workDate}, start_time = #{startTime}, end_time = #{endTime}, "
            + "crosses_midnight = #{crossesMidnight}, duration_minutes = #{durationMinutes}, note = #{note}, "
            + "updated_by = #{operator}, updated_at = NOW(), version = version + 1 "
            + "WHERE id = #{id} AND user_id = #{userId} AND version = #{version} AND deleted = 0")
    int updateOwned(@Param("id") long id, @Param("userId") long userId, @Param("version") int version,
                    @Param("workDate") LocalDate workDate, @Param("startTime") java.time.LocalTime startTime,
                    @Param("endTime") java.time.LocalTime endTime, @Param("crossesMidnight") int crossesMidnight,
                    @Param("durationMinutes") int durationMinutes, @Param("note") String note,
                    @Param("operator") String operator);

    @Update("UPDATE biz_cpm_time_entry SET deleted = 1, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int softDeleteOwned(@Param("id") long id, @Param("userId") long userId, @Param("operator") String operator);
}
