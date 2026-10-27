package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.VehicleBrand;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/** 车辆品牌 Mapper */
@Mapper
public interface VehicleBrandMapper extends BaseMapper<VehicleBrand> {

    /** 品牌列表：启用中的排前面，同级按 sort_order 再按名称 */
    @Select("SELECT * FROM biz_vehicle_brand WHERE deleted = 0 "
            + "AND (#{onlyEnabled} = 0 OR status = 'enabled') ORDER BY status, sort_order, brand_name")
    List<VehicleBrand> listForSelect(@Param("onlyEnabled") int onlyEnabled);

    /** 该车系是否仍被车辆档案引用：删品牌前必须查，否则档案留下指向已删品牌的孤挂引用 */
    @Select("SELECT COUNT(*) FROM biz_vehicle WHERE brand_id = #{brandId} AND deleted = 0")
    int countVehiclesUsing(@Param("brandId") long brandId);

    /** 一次取回"各品牌被多少辆车引用"，避免在列表循环里逐条查（N+1） */
    @Select("SELECT brand_id AS parentId, COUNT(*) AS cnt FROM biz_vehicle "
            + "WHERE deleted = 0 AND brand_id IS NOT NULL GROUP BY brand_id")
    List<Map<String, Object>> countVehiclesGrouped();
}
