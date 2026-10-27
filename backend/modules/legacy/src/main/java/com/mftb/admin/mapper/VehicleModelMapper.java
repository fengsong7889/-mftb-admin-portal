package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.VehicleModel;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/** 年款车型 Mapper */
@Mapper
public interface VehicleModelMapper extends BaseMapper<VehicleModel> {

    @Select("<script>SELECT * FROM biz_vehicle_model WHERE deleted = 0 "
            + "<if test='seriesId != null'> AND series_id = #{seriesId} </if>"
            + "AND (#{onlyEnabled} = 0 OR status = 'enabled') ORDER BY year_label, model_name</script>")
    List<VehicleModel> listBySeries(@Param("seriesId") Long seriesId, @Param("onlyEnabled") int onlyEnabled);

    @Select("SELECT COUNT(*) FROM biz_vehicle_model WHERE series_id = #{seriesId} AND deleted = 0")
    int countChildren(@Param("seriesId") long seriesId);

    @Select("SELECT COUNT(*) FROM biz_vehicle WHERE model_id = #{modelId} AND deleted = 0")
    int countVehiclesUsing(@Param("modelId") long modelId);

    @Select("SELECT series_id AS parentId, COUNT(*) AS cnt FROM biz_vehicle_model "
            + "WHERE deleted = 0 GROUP BY series_id")
    List<Map<String, Object>> countGroupedBySeries();

    @Select("SELECT model_id AS parentId, COUNT(*) AS cnt FROM biz_vehicle "
            + "WHERE deleted = 0 AND model_id IS NOT NULL GROUP BY model_id")
    List<Map<String, Object>> countVehiclesGrouped();
}
