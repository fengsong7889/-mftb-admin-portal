package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AdCellLock;
import org.apache.ibatis.annotations.Mapper;

/** 无敌星星格子加购锁实体（商家加购后锁定 60 秒，其它商家看到已售罄） Mapper */
@Mapper
public interface AdCellLockMapper extends BaseMapper<AdCellLock> {
}
