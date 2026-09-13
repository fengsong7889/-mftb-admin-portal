package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdDayLockRevive;
import org.apache.ibatis.annotations.Mapper;

/** 盘活复苏加购锁实体（商家加购后锁定 60 秒，库存>1 时多商家可分别锁同一格子） Mapper */
@Mapper
public interface AdDayLockReviveMapper extends BaseMapper<AdDayLockRevive> {
}
