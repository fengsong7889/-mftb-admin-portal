package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamAssetStateEvent;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 资产持有关系状态事件 Mapper */
@Mapper
public interface EamAssetStateEventMapper extends BaseMapper<EamAssetStateEvent> {

    /** 按操作人 + 幂等请求键查已存在的事件（用于直接登记入口防重放） */
    @Select("SELECT * FROM biz_eam_asset_state_event "
            + "WHERE operator_id = #{operatorId} AND request_key = #{requestKey} AND deleted = 0 LIMIT 1")
    EamAssetStateEvent selectByRequestKey(@Param("operatorId") Long operatorId, @Param("requestKey") String requestKey);
}
