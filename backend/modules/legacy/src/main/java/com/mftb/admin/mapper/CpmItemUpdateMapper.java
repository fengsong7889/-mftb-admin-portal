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
import java.util.List;

/** CPM 进度流水访问：只追加；读取都是「某人某期间」的轨迹取数。 */
@Mapper
public interface CpmItemUpdateMapper extends BaseMapper<CpmItemUpdate> {

    @Select("SELECT * FROM biz_cpm_item_update WHERE item_id = #{itemId} ORDER BY update_date ASC, id ASC")
    List<CpmItemUpdate> listByItem(@Param("itemId") long itemId);

    /** 期间内该用户全部条目流水（周报聚合轨迹来源，一次取全避免 N+1）。 */
    @Select("SELECT u.* FROM biz_cpm_item_update u JOIN biz_cpm_item i ON i.id = u.item_id "
            + "WHERE i.user_id = #{userId} AND i.deleted = 0 AND u.update_date >= #{start} AND u.update_date <= #{end} "
            + "ORDER BY u.item_id, u.update_date, u.id")
    List<CpmItemUpdate> listByUserAndRange(@Param("userId") long userId,
                                           @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** 期间活跃条目 id 集合：work_date 或任一流水落在期间内。 */
    @Select("SELECT DISTINCT i.id FROM biz_cpm_item i "
            + "LEFT JOIN biz_cpm_item_update u ON u.item_id = i.id "
            + "WHERE i.user_id = #{userId} AND i.deleted = 0 "
            + "AND ((i.work_date >= #{start} AND i.work_date <= #{end}) "
            + "  OR (u.update_date >= #{start} AND u.update_date <= #{end}))")
    List<Long> listActiveItemIds(@Param("userId") long userId,
                                 @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** 当天该用户是否已有此条目的流水（延续一键带入前先查，重复点击不长双份）。 */
    @Select("SELECT COUNT(*) FROM biz_cpm_item_update WHERE item_id = #{itemId} AND update_date = #{date}")
    int countOnDate(@Param("itemId") long itemId, @Param("date") LocalDate date);
}
