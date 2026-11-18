/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;
import java.util.List;

/**
 * CPM 工作条目访问。
 * <p>更新一律走带 version 的条件 UPDATE（影响 0 行=冲突，服务层转「请刷新重试」），
 * 不做「先查再改」——两个人同时在双端编辑同一条是常态而不是意外。
 */
@Mapper
public interface CpmItemMapper extends BaseMapper<CpmItem> {

    /** 日视图：当天有记录或当天有进度流水的条目（延续/轨迹都从这一口径出）。 */
    @Select("SELECT DISTINCT i.* FROM biz_cpm_item i "
            + "LEFT JOIN biz_cpm_item_update u ON u.item_id = i.id "
            + "WHERE i.deleted = 0 AND (i.work_date = #{date} OR u.update_date = #{date}) AND i.user_id = #{userId}")
    List<CpmItem> listActiveOn(@Param("userId") long userId, @Param("date") LocalDate date);

    /** 延续建议候选：前一活跃日未完结（非 done）且当天尚无流水的条目。 */
    @Select("SELECT i.* FROM biz_cpm_item i WHERE i.deleted = 0 AND i.user_id = #{userId} "
            + "AND i.status <> 'done' "
            + "AND COALESCE((SELECT MAX(u.update_date) FROM biz_cpm_item_update u WHERE u.item_id = i.id), i.work_date) < #{date} "
            + "AND i.id NOT IN (SELECT u2.item_id FROM biz_cpm_item_update u2 WHERE u2.update_date = #{date}) "
            + "ORDER BY COALESCE((SELECT MAX(u3.update_date) FROM biz_cpm_item_update u3 WHERE u3.item_id = i.id), i.work_date) DESC "
            + "LIMIT 12")
    List<CpmItem> listCarryCandidates(@Param("userId") long userId, @Param("date") LocalDate date);

    /** 带乐观锁的字段更新：version 不符影响 0 行，由调用方判定冲突。 */
    @Update("<script>UPDATE biz_cpm_item SET"
            + "<if test='title != null'> title = #{title},</if>"
            + "<if test='detail != null'> detail = #{detail},</if>"
            + "<if test='category != null'> category = #{category},</if>"
            + "<if test='status != null'> status = #{status},</if>"
            + "<if test='progress != null'> progress = #{progress},</if>"
            + "<if test='workHours != null'> work_hours = #{workHours},</if>"
            + "<if test='workDate != null'> work_date = #{workDate},</if>"
            + " version = version + 1, updated_by = #{operator}, updated_at = NOW()"
            + " WHERE id = #{id} AND user_id = #{userId} AND deleted = 0 AND version = #{version}</script>")
    int updateOwnedVersioned(@Param("id") long id, @Param("userId") long userId, @Param("version") int version,
                             @Param("title") String title, @Param("detail") String detail,
                             @Param("category") String category, @Param("status") String status,
                             @Param("progress") Integer progress, @Param("workHours") java.math.BigDecimal workHours,
                             @Param("workDate") LocalDate workDate, @Param("operator") String operator);

    /** 软删：只能删自己的（user_id 进 WHERE，IDOR 在 SQL 层再挡一次）。 */
    @Update("UPDATE biz_cpm_item SET deleted = 1, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int softDeleteOwned(@Param("id") long id, @Param("userId") long userId, @Param("operator") String operator);

    /** 期末状态缓存回写（聚合收敛后调用；不动 version，避免与人工编辑互撞时丢编辑）。 */
    @Update("UPDATE biz_cpm_item SET status = #{status}, progress = #{progress} "
            + "WHERE id = #{id} AND deleted = 0")
    int syncLatestCache(@Param("id") long id, @Param("status") String status, @Param("progress") int progress);

    /**
     * 行内工时写入（user_id 进 WHERE，与软删同一条 IDOR 防线）。
     * <p>刻意不动 version：工时是「投入侧分布统计」的旁路字段，不该让只想补个工时的人
     * 跟另一端的正文编辑互相顶回草稿；也不进任何评价口径。
     */
    @Update("UPDATE biz_cpm_item SET work_hours = #{workHours}, updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND user_id = #{userId} AND deleted = 0")
    int updateWorkHoursOwned(@Param("id") long id, @Param("userId") long userId,
                             @Param("workHours") java.math.BigDecimal workHours,
                             @Param("operator") String operator);

    @Select("SELECT * FROM biz_cpm_item WHERE id = #{id} AND deleted = 0")
    CpmItem selectAliveById(@Param("id") long id);
}
