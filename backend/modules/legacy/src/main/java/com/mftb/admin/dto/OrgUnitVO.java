package com.mftb.admin.dto;

import com.mftb.admin.entity.OrgUnit;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 管理組織樹節點（{@code /api/hcm/v1/organization/units/tree} 的出參）。
 * <p>
 * 為什麼不直接返回實體：樹要帶上法人名稱與子節點，前端才能一次渲染完，
 * 不必為每個節點再打一次法人接口（N+1）。
 */
@Data
public class OrgUnitVO {

    private Long id;
    private String code;
    private String name;
    private String nameEn;
    private Long parentId;
    private Long legalEntityId;
    private String legalEntityName;
    private String unitType;
    private String leaderName;
    private String path;
    private Integer status;
    private Integer sortOrder;
    private String remark;
    private List<OrgUnitVO> children = new ArrayList<>();

    public static OrgUnitVO from(OrgUnit unit) {
        OrgUnitVO vo = new OrgUnitVO();
        vo.setId(unit.getId());
        vo.setCode(unit.getCode());
        vo.setName(unit.getName());
        vo.setNameEn(unit.getNameEn());
        vo.setParentId(unit.getParentId());
        vo.setLegalEntityId(unit.getLegalEntityId());
        vo.setUnitType(unit.getUnitType());
        vo.setLeaderName(unit.getLeaderName());
        vo.setPath(unit.getPath());
        vo.setStatus(unit.getStatus());
        vo.setSortOrder(unit.getSortOrder());
        vo.setRemark(unit.getRemark());
        return vo;
    }
}
