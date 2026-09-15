package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamAsset;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 资产台账实体 Mapper */
@Mapper
public interface EamAssetMapper extends BaseMapper<EamAsset> {
    @Select("SELECT COUNT(*) FROM biz_eam_asset WHERE asset_no = #{assetNo} "
            + "AND (#{excludeId} IS NULL OR id != #{excludeId})")
    long countAssetNo(@Param("assetNo") String assetNo, @Param("excludeId") Long excludeId);
}
