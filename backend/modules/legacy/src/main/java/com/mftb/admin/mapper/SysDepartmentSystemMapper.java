package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SysDepartmentSystem;
import org.apache.ibatis.annotations.Mapper;

/** 部门 × 系统 准入关联 —— 表 sys_department_system 的数据访问层，继承 BaseMapper，无自定义 SQL。 */
@Mapper
public interface SysDepartmentSystemMapper extends BaseMapper<SysDepartmentSystem> {
}
