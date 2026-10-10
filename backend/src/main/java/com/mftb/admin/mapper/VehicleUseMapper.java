package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.VehicleUse;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

/** 用车单 Mapper */
@Mapper
public interface VehicleUseMapper extends BaseMapper<VehicleUse> {

    /** 按 id 加行锁读取（状态推进与幂等判定必须在同一锁边界内） */
    @Select("SELECT * FROM biz_vehicle_use WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    VehicleUse selectForUpdate(@Param("id") long id);

    /** 幂等键命中已有单据：重复点击/网络重试/OA 重复回调都走这条路返回原结果 */
    @Select("SELECT * FROM biz_vehicle_use WHERE applicant_id = #{operatorId} AND request_key = #{requestKey} "
            + "AND deleted = 0 ORDER BY id LIMIT 1")
    VehicleUse findByIdempotencyKey(@Param("operatorId") long operatorId,
                                    @Param("requestKey") String requestKey);

    /**
     * 状态推进（带来源状态 + 版本双条件）。
     *
     * <p>状态条件不是冗余：只校验 version 时，两个并发请求各自读到不同 version 也能双双推进；
     * 加上 fromStatus 才能保证「同一状态只被推进一次」，旧单重放与重复审批都会在这里被挡住。
     */
    @Update("UPDATE biz_vehicle_use SET status = #{toStatus}, version = version + 1, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND status = #{fromStatus} AND version = #{expectVersion} AND deleted = 0")
    int updateStatusVersioned(@Param("id") long id,
                              @Param("fromStatus") String fromStatus,
                              @Param("toStatus") String toStatus,
                              @Param("expectVersion") int expectVersion,
                              @Param("operator") String operator);

    /**
     * 与本单冲突的其他用车单号（用于向使用方说明“被哪一单占了”）。
     *
     * <p>车辆或驾驶人任一命中即算冲突：同一驾驶人同时被派两台车同样不可执行。
     * <p>本方法的占用状态集合必须与 {@code VehicleConstants.OCCUPYING_STATUSES} 一致，
     * 两处不一致会同时出现「能重复派车」和「空车却报冲突」两种相反的错误。
     */
    @Select("<script>"
            + "SELECT use_no FROM biz_vehicle_use "
            + "WHERE deleted = 0 AND status IN ('to_depart','in_use','to_confirm') "
            + "AND planned_start &lt; #{end} AND planned_end &gt; #{start} "
            + "<if test='excludeUseId != null'> AND id &lt;&gt; #{excludeUseId} </if>"
            + "AND ( final_vehicle_id = #{vehicleId} OR driver_id = #{driverId} )"
            + "LIMIT 10"
            + "</script>")
    List<String> findConflictUseNos(@Param("vehicleId") Long vehicleId,
                                    @Param("driverId") Long driverId,
                                    @Param("start") java.time.LocalDateTime start,
                                    @Param("end") java.time.LocalDateTime end,
                                    @Param("excludeUseId") Long excludeUseId);

    /** 车辆安排：同一条 UPDATE 里落安排结果与状态推进，避免"状态已改、安排信息没落"的半提交 */
    @Update("UPDATE biz_vehicle_use SET final_vehicle_id = #{vehicleId}, final_plate_no = #{plateNo}, "
            + "driver_id = #{driverId}, driver_emp_no = #{driverEmpNo}, driver_name = #{driverName}, "
            + "assign_by_id = #{assignById}, assign_by_name = #{assignByName}, assign_at = #{assignAt}, "
            + "conflict_note = #{conflictNote}, status = 'to_depart', version = version + 1, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND status IN ('to_assign','to_depart') AND deleted = 0")
    int applyAssignment(@Param("id") long id,
                        @Param("vehicleId") Long vehicleId,
                        @Param("plateNo") String plateNo,
                        @Param("driverId") Long driverId,
                        @Param("driverEmpNo") String driverEmpNo,
                        @Param("driverName") String driverName,
                        @Param("assignById") Long assignById,
                        @Param("assignByName") String assignByName,
                        @Param("assignAt") LocalDateTime assignAt,
                        @Param("conflictNote") String conflictNote,
                        @Param("operator") String operator);

    /*
     * 待办统计与超时计数不在这里：它们必须与列表共用同一套条件构造（
     * 见 VehicleUseServiceImpl#todoStats），写在 Mapper 里就会变成第二套口径，
     * 搜索后卡片数字不会变。
     */
}
