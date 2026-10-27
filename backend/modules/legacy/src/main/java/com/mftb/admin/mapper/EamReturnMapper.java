package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamReturn;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 归还记录 Mapper */
@Mapper
public interface EamReturnMapper extends BaseMapper<EamReturn> {

    @Select("SELECT * FROM biz_eam_return WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamReturn selectForUpdate(@Param("id") long id);
}
