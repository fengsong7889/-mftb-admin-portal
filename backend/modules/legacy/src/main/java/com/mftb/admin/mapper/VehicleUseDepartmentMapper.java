package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.VehicleUseDepartment;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 车辆可使用部门 Mapper */
@Mapper
public interface VehicleUseDepartmentMapper extends BaseMapper<VehicleUseDepartment> {

    /** 取某车当前已授权的部门 ID 集合（权限判定用，不走名称匹配） */
    @Select("SELECT dept_id FROM biz_vehicle_use_department WHERE vehicle_id = #{vehicleId} AND deleted = 0")
    List<Long> listDeptIds(@Param("vehicleId") long vehicleId);

    /** 取某车当前已授权的部门（含名称快照，供详情展示） */
    @Select("SELECT * FROM biz_vehicle_use_department WHERE vehicle_id = #{vehicleId} AND deleted = 0 ORDER BY dept_id")
    List<VehicleUseDepartment> listByVehicle(@Param("vehicleId") long vehicleId);

    /**
     * 批量取多辆车的部门授权（供列表页一次装填）。
     *
     * <p>为什么需要它：列表页若不返 allowedDepts，「授权直接登记」表单就拿不到可用部门，
     * 部门下拉永远为空、提交按钮永久置灰——端到端测试里这就是 P0 阻断。
     * 在循环里逐车调 listByVehicle 会变成 N+1，所以这里一次 IN 查询取回。
     */
    @Select("<script>SELECT * FROM biz_vehicle_use_department WHERE deleted = 0 AND vehicle_id IN "
            + "<foreach item='id' collection='vehicleIds' open='(' separator=',' close=')'>#{id}</foreach> "
            + "ORDER BY vehicle_id, dept_id</script>")
    List<VehicleUseDepartment> listByVehicles(@Param("vehicleIds") List<Long> vehicleIds);

    /**
     * 物理清空某车的部门授权行，供"整组覆盖式保存"使用。
     *
     * <p>这里不用逻辑删除：授权关系是纯映射表，没有留痕需求（谁在何时授权会写进
     * biz_vehicle_use_event，那才是审计载体）。若改为软删，重新授权同一部门会撞上
     * 生成列唯一键（active_key 只区分 deleted），保存会莫名失败。
     */
    @Delete("DELETE FROM biz_vehicle_use_department WHERE vehicle_id = #{vehicleId}")
    int purgeByVehicle(@Param("vehicleId") long vehicleId);

    /** 反查：某部门可用的车辆 ID（用于"我可申请的車"下拉与数据范围过滤） */
    @Select("SELECT vehicle_id FROM biz_vehicle_use_department WHERE dept_id = #{deptId} AND deleted = 0")
    List<Long> listVehicleIdsByDept(@Param("deptId") long deptId);
}
