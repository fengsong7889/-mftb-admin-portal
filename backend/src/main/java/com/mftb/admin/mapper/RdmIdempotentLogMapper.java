package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmIdempotentLog;
import org.apache.ibatis.annotations.Mapper;

/** 幂等请求日志 Mapper */
@Mapper
public interface RdmIdempotentLogMapper extends BaseMapper<RdmIdempotentLog> {
}
