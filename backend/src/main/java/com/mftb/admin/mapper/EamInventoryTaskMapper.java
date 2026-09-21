package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamInventoryTask;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 资产盘点任务 Mapper */
@Mapper
public interface EamInventoryTaskMapper extends BaseMapper<EamInventoryTask> {

    @Select("SELECT * FROM biz_eam_inventory_task WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamInventoryTask selectForUpdate(@Param("id") long id);

    /** 按创建幂等键锁定既有任务行（并发/重复提交时先锁再判定） */
    @Select("SELECT * FROM biz_eam_inventory_task WHERE created_by_id = #{operatorId} "
            + "AND create_request_key = #{requestKey} AND deleted = 0 LIMIT 1")
    EamInventoryTask selectByCreateRequest(@Param("operatorId") long operatorId,
                                           @Param("requestKey") String requestKey);
}
