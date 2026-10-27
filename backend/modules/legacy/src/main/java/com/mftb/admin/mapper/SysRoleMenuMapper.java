package com.mftb.admin.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mftb.admin.entity.SysRoleMenu;
import org.apache.ibatis.annotations.Mapper;

/**
 * 角色-菜单权限关联 Mapper
 */
@Mapper
public interface SysRoleMenuMapper extends BaseMapper<SysRoleMenu> {
}
