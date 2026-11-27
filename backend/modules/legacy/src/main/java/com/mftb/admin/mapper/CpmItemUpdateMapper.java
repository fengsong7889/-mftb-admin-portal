/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.CpmItemUpdate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/** CPM 进度流水访问：只追加；读取都是「某人某期间」的轨迹取数。 */
@Mapper
public interface CpmItemUpdateMapper extends BaseMapper<CpmItemUpdate> {

    @Select("SELECT * FROM biz_cpm_item_update WHERE item_id = #{itemId} ORDER BY update_date ASC, id ASC")
    List<CpmItemUpdate> listByItem(@Param("itemId") long itemId);

    /** 单条任务进度历史懒加载：只读窗口内流水，避免打开弹层时把多年记录一次拉回。 */
    @Select("SELECT * FROM biz_cpm_item_update WHERE item_id = #{itemId} "
            + "AND update_date >= #{start} AND update_date <= #{end} ORDER BY update_date ASC, id ASC")
    List<CpmItemUpdate> listByItemInRange(@Param("itemId") long itemId,
                                          @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** 单任务总流水数：用于判断 400 天窗口是否确实省略了更早记录。 */
    @Select("SELECT COUNT(*) FROM biz_cpm_item_update WHERE item_id = #{itemId}")
    int countByItem(@Param("itemId") long itemId);

    /**
     * 台账快照边界点：每条任务最多取 1 行。
     *
     * <p>{@code date=null} 取全历史最新一笔；否则取不晚于该日的最后一笔。
     * 服务层分别取全历史、期初、期末三个边界即可还原快照，不必把 400 天流水全拉回内存。
     */
    @Select("<script>SELECT u.* FROM biz_cpm_item_update u JOIN biz_cpm_item i ON i.id = u.item_id "
            + "WHERE i.user_id = #{userId} AND i.deleted = 0 "
            + "AND u.item_id IN <foreach collection='itemIds' item='id' open='(' separator=',' close=')'>#{id}</foreach> "
            + "<if test='date != null'>AND u.update_date &lt;= #{date}</if> "
            + "AND NOT EXISTS (SELECT 1 FROM biz_cpm_item_update n WHERE n.item_id = u.item_id "
            + "<if test='date != null'>AND n.update_date &lt;= #{date}</if> "
            + "AND (n.update_date &gt; u.update_date OR (n.update_date = u.update_date AND n.id &gt; u.id))) "
            + "</script>")
    List<CpmItemUpdate> listLatestPerItem(@Param("userId") long userId,
                                          @Param("itemIds") Collection<Long> itemIds,
                                          @Param("date") LocalDate date);

    /** 期间内该用户全部条目流水（周报聚合轨迹来源，一次取全避免 N+1）。 */
    @Select("SELECT u.* FROM biz_cpm_item_update u JOIN biz_cpm_item i ON i.id = u.item_id "
            + "WHERE i.user_id = #{userId} AND i.deleted = 0 AND u.update_date >= #{start} AND u.update_date <= #{end} "
            + "ORDER BY u.item_id, u.update_date, u.id")
    List<CpmItemUpdate> listByUserAndRange(@Param("userId") long userId,
                                           @Param("start") LocalDate start, @Param("end") LocalDate end);

    /**
     * 期间活跃条目 id 集合：work_date、任一流水、<b>或任一投入时段</b>落在期间内。
     *
     * <p>阶段三加上第三个 OR 分支而不是让工时只走独立聚合查询：一条只有投入时段、
     * work_date 与流水都在期间外的情形是真实存在的（补记上周某天的起止时间），
     * 少了这个分支，明细里不会有它，而时段合计里有它——「明细加起来 ≠ 总数」
     * 是最难解释的一种不一致，且两边各自都「没错」。
     */
    @Select("SELECT DISTINCT i.id FROM biz_cpm_item i "
            + "LEFT JOIN biz_cpm_item_update u ON u.item_id = i.id "
            + "LEFT JOIN biz_cpm_time_entry t ON t.item_id = i.id AND t.deleted = 0 "
            + "  AND t.work_date >= #{start} AND t.work_date <= #{end} "
            + "WHERE i.user_id = #{userId} AND i.deleted = 0 "
            + "AND ((i.work_date >= #{start} AND i.work_date <= #{end}) "
            + "  OR (u.update_date >= #{start} AND u.update_date <= #{end}) "
            + "  OR t.id IS NOT NULL)")
    List<Long> listActiveItemIds(@Param("userId") long userId,
                                 @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** 当天该用户是否已有此条目的流水（延续一键带入前先查，重复点击不长双份）。 */
    @Select("SELECT COUNT(*) FROM biz_cpm_item_update WHERE item_id = #{itemId} AND update_date = #{date}")
    int countOnDate(@Param("itemId") long itemId, @Param("date") LocalDate date);
}
