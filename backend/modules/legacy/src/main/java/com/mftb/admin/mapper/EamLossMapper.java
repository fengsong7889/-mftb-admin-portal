package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamLoss;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 遗失单 Mapper */
@Mapper
public interface EamLossMapper extends BaseMapper<EamLoss> {

    @Select("SELECT * FROM biz_eam_loss WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamLoss selectForUpdate(@Param("id") long id);
}
