package com.mftb.admin.dto;

import com.mftb.admin.entity.SysDepartment;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 部门视图对象
 */
@Data
public class DepartmentVO {

    private Long id;
    private String code;
    private String name;
    /** 部门英文名称 */
    private String nameEn;
    private Long parentId;
    /** 上级部门名称 */
    private String parentName;
    private String leader;
    private Integer status;
    private Integer sort;
    /** 部门授权的菜单权限 */
    private List<MenuPermissionDTO> permissions;
    /** 部门在编人数 */
    private Long userCount;
    private LocalDateTime createdAt;
    /** 最后更新人 */
    private String updatedBy;
    /** 最后更新时间 */
    private LocalDateTime updatedAt;

    public static DepartmentVO from(SysDepartment dept, String parentName, Long userCount,
                                     List<MenuPermissionDTO> permissions) {
        DepartmentVO vo = new DepartmentVO();
        vo.setId(dept.getId());
        vo.setCode(dept.getCode());
        vo.setName(dept.getName());
        vo.setNameEn(dept.getNameEn());
        vo.setParentId(dept.getParentId());
        vo.setParentName(parentName);
        vo.setLeader(dept.getLeader());
        vo.setStatus(dept.getStatus());
        vo.setSort(dept.getSort());
        vo.setPermissions(permissions == null ? List.of() : permissions);
        vo.setUserCount(userCount);
        vo.setCreatedAt(dept.getCreatedAt());
        vo.setUpdatedBy(dept.getUpdatedBy());
        vo.setUpdatedAt(dept.getUpdatedAt());
        return vo;
    }
}
