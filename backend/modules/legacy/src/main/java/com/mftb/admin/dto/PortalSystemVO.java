package com.mftb.admin.dto;

import com.mftb.admin.entity.SysSystem;
import lombok.Data;

/**
 * 门户系统卡片视图对象。
 * <p>只包含前端渲染卡片所需最小字段；{@code description} 允许为空。
 */
@Data
public class PortalSystemVO {

    /** 系统编码（sys_system.code） */
    private String code;
    /** 中文名 */
    private String name;
    /** 英文名（用于 i18n fallback） */
    private String nameEn;
    /** 简介 */
    private String description;
    /** 前端图标 key（Ant Design Icons 组件名） */
    private String icon;
    /** 门户排序 */
    private Integer sort;

    public static PortalSystemVO from(SysSystem system) {
        PortalSystemVO vo = new PortalSystemVO();
        vo.setCode(system.getCode());
        vo.setName(system.getName());
        vo.setNameEn(system.getNameEn());
        vo.setDescription(system.getDescription());
        vo.setIcon(system.getIcon());
        vo.setSort(system.getSort());
        return vo;
    }
}
