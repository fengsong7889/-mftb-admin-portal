package com.mftb.admin.dto;

import com.mftb.admin.entity.EmpEmergencyContact;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 紧急联系人视图对象
 */
@Data
public class EmergencyContactVO {

    private Long id;
    private Long userId;
    private String name;
    private String phone;
    private String relation;
    private String createdBy;
    private String updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static EmergencyContactVO from(EmpEmergencyContact entity) {
        EmergencyContactVO vo = new EmergencyContactVO();
        vo.setId(entity.getId());
        vo.setUserId(entity.getUserId());
        vo.setName(entity.getName());
        vo.setPhone(entity.getPhone());
        vo.setRelation(entity.getRelation());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
