package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdCellQuota;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;

/** 广告格子占用计数器实体（防并发超卖） Mapper */
@Mapper
public interface AdCellQuotaMapper extends BaseMapper<AdCellQuota> {

    /**
     * 原子占位: taken+1, 仅当未达上限时生效
     *
     * @return 影响行数, 0 表示该格子已达上限(售罄)
     */
    @Update("UPDATE biz_ad_cell_quota SET taken = taken + 1 " +
            "WHERE module = #{module} AND biz_date = #{bizDate} " +
            "AND region = #{region} AND meal_slot = #{mealSlot} AND taken < #{limit}")
    int tryIncrement(@Param("module") String module,
                     @Param("bizDate") LocalDate bizDate,
                     @Param("region") Integer region,
                     @Param("mealSlot") String mealSlot,
                     @Param("limit") int limit);

    /**
     * 释放占用: taken-1 (退款/取消释放格子), 下限钳位到 0
     */
    @Update("UPDATE biz_ad_cell_quota SET taken = GREATEST(taken - 1, 0) " +
            "WHERE module = #{module} AND biz_date = #{bizDate} " +
            "AND region = #{region} AND meal_slot = #{mealSlot}")
    int decrement(@Param("module") String module,
                  @Param("bizDate") LocalDate bizDate,
                  @Param("region") Integer region,
                  @Param("mealSlot") String mealSlot);
}
