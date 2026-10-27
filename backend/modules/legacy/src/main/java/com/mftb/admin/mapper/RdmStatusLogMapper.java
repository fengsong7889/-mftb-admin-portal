package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmStatusLog;
import org.apache.ibatis.annotations.Mapper;

/** 状态流转流水 Mapper（度量与逾期的真值来源） */
@Mapper
public interface RdmStatusLogMapper extends BaseMapper<RdmStatusLog> {
}
