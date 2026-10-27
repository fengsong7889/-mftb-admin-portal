package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.HrLeaveRequest;
import org.apache.ibatis.annotations.Mapper;

/** HR 请假申请单据 Mapper */
@Mapper
public interface HrLeaveRequestMapper extends BaseMapper<HrLeaveRequest> {
}
