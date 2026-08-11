package com.mftb.admin.dto;

import com.mftb.admin.entity.SysDataAuthorization;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 数据授权视图对象
 */
@Data
public class DataAuthorizationVO {

    private Long id;
    /** 授权对象类型: role / department */
    private String targetType;
    /** 角色/部门ID */
    private Long targetId;
    /** 角色/部门名称(展示用) */
    private String targetName;
    /** 商家集团编码 */
    private String groupCode;
    /** 商家集团名称(展示用) */
    private String groupName;
    /** 状态 */
    private Integer status;
    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static DataAuthorizationVO from(SysDataAuthorization entity) {
        DataAuthorizationVO vo = new DataAuthorizationVO();
        vo.setId(entity.getId());
        vo.setTargetType(entity.getTargetType());
        vo.setTargetId(entity.getTargetId());
        vo.setGroupCode(entity.getGroupCode());
        vo.setStatus(entity.getStatus());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
