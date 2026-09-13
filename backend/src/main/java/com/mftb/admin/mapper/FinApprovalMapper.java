package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.FinApproval;
import org.apache.ibatis.annotations.Mapper;

/** 财务审批流程实体（三级审批: 业务主管 -> 运营主管 -> 财务主管） Mapper */
@Mapper
public interface FinApprovalMapper extends BaseMapper<FinApproval> {
}
