package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.VehicleDriverQualification;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 内部员工驾驶资格 Mapper */
@Mapper
public interface VehicleDriverQualificationMapper extends BaseMapper<VehicleDriverQualification> {

    /**
     * 按员工 + 驾照适用地区取现行资格。
     *
     * <p>必须带 region：内地驾照不能用来开澳门市区车，反之亦然。只按员工查会让
     * "有驾照" 变成 "哪儿都能开"，这是本模块最容易做错的权限判定之一。
     */
    @Select("SELECT * FROM biz_vehicle_driver_qualification "
            + "WHERE user_id = #{userId} AND region = #{region} AND deleted = 0 LIMIT 1")
    VehicleDriverQualification findCurrent(@Param("userId") long userId, @Param("region") String region);

    /** 可安排驾驶人候选：已核验且未过期。待核验/失效的由服务层单独提示，不在这里静默隐藏 */
    @Select("SELECT * FROM biz_vehicle_driver_qualification "
            + "WHERE deleted = 0 AND result = 'verified' AND valid_until >= CURDATE() "
            + "ORDER BY emp_no")
    List<VehicleDriverQualification> listEligible();
}
