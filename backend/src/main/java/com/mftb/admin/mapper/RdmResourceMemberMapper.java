package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.RdmResourceMember;
import org.apache.ibatis.annotations.Mapper;

/** 资源名册 Mapper（团队负载纳入人员） */
@Mapper
public interface RdmResourceMemberMapper extends BaseMapper<RdmResourceMember> {
}
