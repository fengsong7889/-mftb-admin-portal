package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.VehicleTrip;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** 用车行程 Mapper（实际发生记录与台账统计口径的唯一出口） */
@Mapper
public interface VehicleTripMapper extends BaseMapper<VehicleTrip> {

    /**
     * 某车最近一次已确认行程的结束里程（= 出车时建议起始里程的真实口径）。
     *
     * <p>为什么不能直接拿车辆档案的 current_odometer：里程基线只能在“本单就是最近一次行程”时
     * 同步，档案值可能因历史数据或人工录入而低于已确认行程，两者不同步时用户按档案填
     * 就会被服务端拒（端到端测试实测：UI 提示 5,350 而拒绝理由是 5450）。
     */
    @Select("SELECT MAX(t.end_odometer) FROM biz_vehicle_trip t "
            + "JOIN biz_vehicle_use u ON u.id = t.use_id "
            + "WHERE t.vehicle_id = #{vehicleId} AND t.deleted = 0 AND u.deleted = 0 "
            + "AND t.status = 'confirmed' AND t.end_odometer IS NOT NULL")
    java.math.BigDecimal latestConfirmedEnd(@Param("vehicleId") long vehicleId);

    /** 按用车单加行锁读取行程（出车/归还/确认推进必须在同一锁边界内） */
    @Select("SELECT * FROM biz_vehicle_trip WHERE use_id = #{useId} AND deleted = 0 FOR UPDATE")
    VehicleTrip selectByUseForUpdate(@Param("useId") long useId);

    /**
     * 台账统计口径。
     *
     * <p>只算 {@code status='confirmed'} 的有效行程：预约、驳回、取消都不算出车次数，
     * 补录待核对与争议核对中的记录单列（pendingCount）。这一口径必须与前端
     * vehicleRules.summarizeLedger 完全一致，否则页面与导出会对不上。
     *
     * <p>期间归属按实际出车日期，跨日行程不拆分。
     */
    @Select("<script>"
            + "SELECT COUNT(CASE WHEN t.status = 'confirmed' THEN 1 END) AS tripCount,"
            + " COALESCE(SUM(CASE WHEN t.status = 'confirmed' THEN t.mileage ELSE 0 END),0) AS totalMileage,"
            + " COALESCE(SUM(CASE WHEN t.status = 'confirmed' THEN t.duration_hours ELSE 0 END),0) AS totalHours,"
            + " COUNT(DISTINCT CASE WHEN t.status = 'confirmed' THEN t.vehicle_id END) AS vehicleCount,"
            + " COUNT(DISTINCT CASE WHEN t.status = 'confirmed' THEN t.driver_id END) AS driverCount,"
            + " COALESCE(SUM(CASE WHEN t.status = 'confirmed' AND FIND_IN_SET('overdue', t.flags) &gt; 0 THEN 1 ELSE 0 END),0) AS overdueCount,"
            + " COALESCE(SUM(CASE WHEN t.status IN ('pending_check','disputed') THEN 1 ELSE 0 END),0) AS pendingCount "
            + "FROM biz_vehicle_trip t JOIN biz_vehicle_use u ON u.id = t.use_id AND u.deleted = 0 "
            + "WHERE t.deleted = 0 "
            + "<if test='from != null'> AND t.depart_at &gt;= #{from} </if>"
            + "<if test='to != null'> AND t.depart_at &lt; DATE_ADD(#{to}, INTERVAL 1 DAY) </if>"
            + "<if test='vehicleId != null'> AND t.vehicle_id = #{vehicleId} </if>"
            + "<if test='driverId != null'> AND t.driver_id = #{driverId} </if>"
            + "<if test='departmentId != null'> AND u.department_id = #{departmentId} </if>"
            + "<if test='source != null'> AND u.source = #{source} </if>"
            + "<if test='vehicleIds != null'> AND t.vehicle_id IN (<foreach collection='vehicleIds' item='v' separator=','>#{v}</foreach>) </if>"
            + "</script>")
    Map<String, Object> ledgerStats(@Param("from") java.time.LocalDateTime from,
                                    @Param("to") java.time.LocalDateTime to,
                                    @Param("vehicleId") Long vehicleId,
                                    @Param("driverId") Long driverId,
                                    @Param("departmentId") Long departmentId,
                                    @Param("source") String source,
                                    @Param("vehicleIds") List<Long> vehicleIds);

    /**
     * 按部门汇总有效行程的次数与里程（费用分摊/部门使用占比的最小报表）。
     * 只出有分母的事实，不算缺乏分母的"利用率"。
     */
    @Select("SELECT u.department_id AS departmentId, u.department_name AS departmentName,"
            + " COUNT(*) AS tripCount, COALESCE(SUM(t.mileage),0) AS totalMileage "
            + "FROM biz_vehicle_trip t JOIN biz_vehicle_use u ON u.id = t.use_id AND u.deleted = 0 "
            + "WHERE t.deleted = 0 AND t.status = 'confirmed' "
            + "GROUP BY u.department_id, u.department_name ORDER BY tripCount DESC LIMIT 50")
    List<Map<String, Object>> ledgerByDepartment();

    /** 按车辆汇总（一车一档的使用密度） */
    @Select("SELECT t.vehicle_id AS vehicleId, t.vehicle_plate_no AS plateNo,"
            + " COUNT(*) AS tripCount, COALESCE(SUM(t.mileage),0) AS totalMileage "
            + "FROM biz_vehicle_trip t JOIN biz_vehicle_use u ON u.id = t.use_id AND u.deleted = 0 "
            + "WHERE t.deleted = 0 AND t.status = 'confirmed' "
            + "GROUP BY t.vehicle_id, t.vehicle_plate_no ORDER BY totalMileage DESC LIMIT 50")
    List<Map<String, Object>> ledgerByVehicle();

    /**
     * 归还确认（幂等 + 状态双条件）。
     *
     * <p>WHERE 里同时钉 status 与 version：重复点击"确认归档"时第二次受影响行数为 0，
     * 服务层据此拒绝而不是把 confirmAt 覆盖成新时间。
     */
    @Update("UPDATE biz_vehicle_trip SET status = 'confirmed', confirm_by_id = #{confirmById}, "
            + "confirm_by_name = #{confirmByName}, confirm_at = NOW(), version = version + 1, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND status = #{fromStatus} AND version = #{expectVersion} AND deleted = 0")
    int confirmTrip(@Param("id") long id, @Param("fromStatus") String fromStatus,
                    @Param("confirmById") Long confirmById, @Param("confirmByName") String confirmByName,
                    @Param("expectVersion") int expectVersion, @Param("operator") String operator);
}
