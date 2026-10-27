package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.VehicleSeries;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/** 车系 Mapper */
@Mapper
public interface VehicleSeriesMapper extends BaseMapper<VehicleSeries> {

    /** 按品牌取车系；brandId 为空表示取全部（供级联与列表页用） */
    @Select("<script>SELECT * FROM biz_vehicle_series WHERE deleted = 0 "
            + "<if test='brandId != null'> AND brand_id = #{brandId} </if>"
            + "AND (#{onlyEnabled} = 0 OR status = 'enabled') ORDER BY series_name</script>")
    List<VehicleSeries> listByBrand(@Param("brandId") Long brandId, @Param("onlyEnabled") int onlyEnabled);

    @Select("SELECT COUNT(*) FROM biz_vehicle_series WHERE brand_id = #{brandId} AND deleted = 0")
    int countChildren(@Param("brandId") long brandId);

    @Select("SELECT COUNT(*) FROM biz_vehicle WHERE series_id = #{seriesId} AND deleted = 0")
    int countVehiclesUsing(@Param("seriesId") long seriesId);

    @Select("SELECT brand_id AS parentId, COUNT(*) AS cnt FROM biz_vehicle_series "
            + "WHERE deleted = 0 GROUP BY brand_id")
    List<Map<String, Object>> countGroupedByBrand();

    @Select("SELECT series_id AS parentId, COUNT(*) AS cnt FROM biz_vehicle "
            + "WHERE deleted = 0 AND series_id IS NOT NULL GROUP BY series_id")
    List<Map<String, Object>> countVehiclesGrouped();
}
