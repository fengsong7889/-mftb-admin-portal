package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.AttPunchLog;
import org.apache.ibatis.annotations.Mapper;

/** 考勤打卡流水 Mapper（只读账本：写入来自钉钉同步与导入，业务侧不提供修改） */
@Mapper
public interface AttPunchLogMapper extends BaseMapper<AttPunchLog> {
}
