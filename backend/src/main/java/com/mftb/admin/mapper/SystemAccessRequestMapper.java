package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SystemAccessRequest;
import org.apache.ibatis.annotations.Mapper;

/** 系統權限申請單 —— 表 biz_system_access_request 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface SystemAccessRequestMapper extends BaseMapper<SystemAccessRequest> {
}
