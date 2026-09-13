package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamLocation;
import org.apache.ibatis.annotations.Mapper;

/** 仓库 / 存放位置实体（树形：仓库/楼层/办公室） Mapper */
@Mapper
public interface EamLocationMapper extends BaseMapper<EamLocation> {
}
