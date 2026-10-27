package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SysConfig;
import org.apache.ibatis.annotations.Mapper;

/** 系统配置实体（通用 key-value 存储） Mapper */
@Mapper
public interface SysConfigMapper extends BaseMapper<SysConfig> {
}
