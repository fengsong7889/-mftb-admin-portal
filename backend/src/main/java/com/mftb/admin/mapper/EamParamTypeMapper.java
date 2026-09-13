package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamParamType;
import org.apache.ibatis.annotations.Mapper;

/** 参数类型实体（按分类维度管理，如 CPU / 内存 / 存储） Mapper */
@Mapper
public interface EamParamTypeMapper extends BaseMapper<EamParamType> {
}
