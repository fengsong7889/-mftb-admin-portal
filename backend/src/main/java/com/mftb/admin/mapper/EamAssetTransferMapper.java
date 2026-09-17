package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamAssetTransfer;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 资产调拨单 Mapper */
@Mapper
public interface EamAssetTransferMapper extends BaseMapper<EamAssetTransfer> {

    @Select("SELECT * FROM biz_eam_transfer WHERE id = #{id} AND deleted = 0 FOR UPDATE")
    EamAssetTransfer selectForUpdate(@Param("id") long id);
}
