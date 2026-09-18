package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamConsumableClaim;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 耗材领用单 Mapper */
@Mapper
public interface EamConsumableClaimMapper extends BaseMapper<EamConsumableClaim> {

    /** 加行锁读取领用单（状态流转前使用，防并发重复审批/出库） */
    @Select("SELECT * FROM biz_eam_consumable_claim WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamConsumableClaim selectForUpdate(@Param("id") long id);
}
