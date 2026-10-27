package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.OaApprovalTask;
import org.apache.ibatis.annotations.Mapper;

/** OA审批任务实体（每个审批节点一条记录） Mapper */
@Mapper
public interface OaApprovalTaskMapper extends BaseMapper<OaApprovalTask> {
}
