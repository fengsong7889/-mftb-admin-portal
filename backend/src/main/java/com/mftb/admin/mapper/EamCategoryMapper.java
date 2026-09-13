package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamCategory;
import org.apache.ibatis.annotations.Mapper;

/** 资产分类实体（树形，含参数模板） Mapper */
@Mapper
public interface EamCategoryMapper extends BaseMapper<EamCategory> {
}
