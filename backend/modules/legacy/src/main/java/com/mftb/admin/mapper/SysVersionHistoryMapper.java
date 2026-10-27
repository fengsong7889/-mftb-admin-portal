package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SysVersionHistory;
import org.apache.ibatis.annotations.Mapper;

/** 版本发布历史记录 Mapper */
@Mapper
public interface SysVersionHistoryMapper extends BaseMapper<SysVersionHistory> {
}
