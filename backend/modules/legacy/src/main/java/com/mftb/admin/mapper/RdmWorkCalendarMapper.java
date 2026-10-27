package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmWorkCalendar;
import org.apache.ibatis.annotations.Mapper;

/** 工作日历 Mapper（只存例外日：请假/加班/自定义容量） */
@Mapper
public interface RdmWorkCalendarMapper extends BaseMapper<RdmWorkCalendar> {
}
