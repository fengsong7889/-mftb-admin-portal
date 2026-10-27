package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamAsset;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 资产台账实体 Mapper */
@Mapper
public interface EamAssetMapper extends BaseMapper<EamAsset> {
    /**
     * 统计同名资产编号的条数；excludeId 用于编辑场景排除自身（传 null 则不排除）。
     * <p>
     * ⚠️ 本句**不过滤 deleted**，所以已软删除资产的编号仍被计为占用，
     * 删掉的资产编号无法被新资产复用。
     */
    @Select("SELECT COUNT(*) FROM biz_eam_asset WHERE asset_no = #{assetNo} "
            + "AND (#{excludeId} IS NULL OR id != #{excludeId})")
    long countAssetNo(@Param("assetNo") String assetNo, @Param("excludeId") Long excludeId);
}
