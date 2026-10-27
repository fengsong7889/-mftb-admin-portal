package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamHandover;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 资产交接单 Mapper */
@Mapper
public interface EamHandoverMapper extends BaseMapper<EamHandover> {

    @Select("SELECT * FROM biz_eam_handover WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamHandover selectForUpdate(@Param("id") long id);
}
