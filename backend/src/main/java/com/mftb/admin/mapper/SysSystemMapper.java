package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SysSystem;
import org.apache.ibatis.annotations.Mapper;

/** 业务系统清单实体（用于统一门户与系统准入） —— 表 sys_system 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface SysSystemMapper extends BaseMapper<SysSystem> {
}
