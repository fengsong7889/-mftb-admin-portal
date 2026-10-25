package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.HcmPiiAccessLog;
import org.apache.ibatis.annotations.Mapper;

/** 敏感字段查看留痕 Mapper */
@Mapper
public interface HcmPiiAccessLogMapper extends BaseMapper<HcmPiiAccessLog> {
}
