package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.HrPerfIndicator;
import org.apache.ibatis.annotations.Mapper;

/** 模板指标（考核单实例化时复制为明细打分项）。 Mapper */
@Mapper
public interface HrPerfIndicatorMapper extends BaseMapper<HrPerfIndicator> {
}
