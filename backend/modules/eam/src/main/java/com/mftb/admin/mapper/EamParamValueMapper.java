package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamParamValue;
import org.apache.ibatis.annotations.Mapper;

/** 参数值实体（参数类型的可选项，如 A18 Pro / 16GB / 512GB） Mapper */
@Mapper
public interface EamParamValueMapper extends BaseMapper<EamParamValue> {
}
