package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.HrPerfCalibrationLog;
import org.apache.ibatis.annotations.Mapper;

/** 績效改判留痕（只增不改的流水） Mapper */
@Mapper
public interface HrPerfCalibrationLogMapper extends BaseMapper<HrPerfCalibrationLog> {
}
