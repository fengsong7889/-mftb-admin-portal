package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SysDepartmentMenu;
import org.apache.ibatis.annotations.Mapper;

/**
 * 部门-菜单权限关联 Mapper
 */
@Mapper
public interface SysDepartmentMenuMapper extends BaseMapper<SysDepartmentMenu> {
}
