package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.VehicleManager;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 车辆授权管理人员 Mapper */
@Mapper
public interface VehicleManagerMapper extends BaseMapper<VehicleManager> {

    /** 某车的授权管理人员 */
    @Select("SELECT * FROM biz_vehicle_manager WHERE vehicle_id = #{vehicleId} AND deleted = 0 ORDER BY level, emp_no")
    List<VehicleManager> listByVehicle(@Param("vehicleId") long vehicleId);

    /**
     * 批量取多辆车的授权管理人员（供列表页一次装填，避开 N+1）。
     *
     * <p>列表页不返 managers 时，前端 DirectRegisterForm 对非超管执行
     * {@code v.managers.some(...)} 会直接 TypeError 白屏（超管走短路判断所以测不出来）。
     */
    @Select("<script>SELECT * FROM biz_vehicle_manager WHERE deleted = 0 AND vehicle_id IN "
            + "<foreach item='id' collection='vehicleIds' open='(' separator=',' close=')'>#{id}</foreach> "
            + "ORDER BY vehicle_id, level, emp_no</script>")
    List<VehicleManager> listByVehicles(@Param("vehicleIds") List<Long> vehicleIds);

    /**
     * 本人可办理（level=manage）的车辆 ID。
     *
     * <p>这是车辆域数据范围的真值来源：不能用 DataScopeService（那套是商家集团 group_code），
     * 也不能靠"有 vehicle-dispatch 菜单"就放开全部车辆——菜单权限与资源范围是两层。
     * 返回空列表表示"只能办没配管理员的车"还是"什么都不能办"必须由服务层显式决定，
     * 本方法不做解释。
     */
    @Select("SELECT vehicle_id FROM biz_vehicle_manager "
            + "WHERE user_id = #{userId} AND level = 'manage' AND deleted = 0")
    List<Long> listManageableVehicleIds(@Param("userId") long userId);

    /** 本人是否该车授权管理人员（manage 级）：单点判定，避免把整张表拉回内存再比 */
    @Select("SELECT COUNT(*) FROM biz_vehicle_manager "
            + "WHERE vehicle_id = #{vehicleId} AND user_id = #{userId} AND level = 'manage' AND deleted = 0")
    long countManageGrant(@Param("vehicleId") long vehicleId, @Param("userId") long userId);

    /** 整组覆盖式保存：物理清空（与部门授权同理，留痕走 biz_vehicle_use_event） */
    @Delete("DELETE FROM biz_vehicle_manager WHERE vehicle_id = #{vehicleId}")
    int purgeByVehicle(@Param("vehicleId") long vehicleId);
}
