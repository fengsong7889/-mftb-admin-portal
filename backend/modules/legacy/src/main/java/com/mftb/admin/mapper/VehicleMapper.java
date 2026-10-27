package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.Vehicle;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** 车辆运行档案 Mapper */
@Mapper
public interface VehicleMapper extends BaseMapper<Vehicle> {

    /**
     * 按 id 加行锁读取车辆档案（必须在事务内调用）。
     *
     * <p>为什么必须锁车辆行：时段冲突是"先查后写"的竞态典型。两个车管同时给
     * MT-88-01 排同一段时，如果只做 SELECT COUNT + INSERT，两条都会被判定无冲突并双双写入。
     * 把"锁住这辆车 → 当前读检查占用 → 写入"放进同一个锁边界，才是结构性正确；
     * 唯一索引只能挡住完全相同窗口的重复，挡不住区间重叠。
     */
    @Select("SELECT * FROM biz_vehicle WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    Vehicle selectForUpdate(@Param("id") long id);

    /**
     * 推进里程基线：只在前进时更新，避免异常/未核对的里程污染后续单据的默认起始值。
     *
     * <p>{@code current_odometer <= #{odometer}} 是必要条件而不是可选优化：没有它，
     * 一条被更正回退的行程会把基线拉低，下一单就会带出偏低的起始里程。
     */
    @Update("UPDATE biz_vehicle SET current_odometer = #{odometer}, version = version + 1, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND deleted = 0 AND current_odometer <= #{odometer}")
    int advanceOdometer(@Param("id") long id, @Param("odometer") java.math.BigDecimal odometer,
                        @Param("operator") String operator);

    /** 乐观锁更新运行状态：受影响行数为 0 说明被人并发改过，必须让调用方报错而不是静默覆盖 */
    @Update("UPDATE biz_vehicle SET status = #{status}, version = version + 1, "
            + "updated_by = #{operator}, updated_at = NOW() "
            + "WHERE id = #{id} AND version = #{expectVersion} AND deleted = 0")
    int updateStatusVersioned(@Param("id") long id, @Param("status") String status,
                              @Param("expectVersion") long expectVersion,
                              @Param("operator") String operator);
}
