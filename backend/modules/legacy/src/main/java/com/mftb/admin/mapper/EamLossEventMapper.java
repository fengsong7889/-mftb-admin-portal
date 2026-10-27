package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.EamLossEvent;
import org.apache.ibatis.annotations.Mapper;

/** 遗失事件日志 Mapper */
@Mapper
public interface EamLossEventMapper extends BaseMapper<EamLossEvent> {
}
