package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.VehicleUseEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 用车审计事件 Mapper
 *
 * <p>只提供 insert 与查询：没有任何 update/delete 方法，业务页面也就无从删改留痕。
 */
@Mapper
public interface VehicleUseEventMapper extends BaseMapper<VehicleUseEvent> {

    /** 某单的审计轨迹（按时间正序，受限独立记录页消费，不塞进详情底部） */
    @Select("SELECT * FROM biz_vehicle_use_event WHERE use_id = #{useId} ORDER BY id")
    List<VehicleUseEvent> listByUse(@Param("useId") long useId);

    /** 某车的配置变更轨迹（授权、开关、状态变更） */
    @Select("SELECT * FROM biz_vehicle_use_event WHERE vehicle_id = #{vehicleId} ORDER BY id DESC LIMIT 100")
    List<VehicleUseEvent> listByVehicle(@Param("vehicleId") long vehicleId);

    /** 幂等键是否已留痕：重复回调时用于跳过，避免同一次动作留下两条事件 */
    @Select("SELECT COUNT(*) FROM biz_vehicle_use_event WHERE operator_id = #{operatorId} AND request_key = #{requestKey}")
    long countByIdempotencyKey(@Param("operatorId") long operatorId, @Param("requestKey") String requestKey);
}
