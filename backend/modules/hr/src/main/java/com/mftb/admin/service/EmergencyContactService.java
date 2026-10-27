package com.mftb.admin.service;

import com.mftb.admin.dto.EmergencyContactRequest;
import com.mftb.admin.dto.EmergencyContactVO;

import java.util.List;

/**
 * 紧急联系人服务
 */
public interface EmergencyContactService {

    /** 查询某员工的紧急联系人列表 */
    List<EmergencyContactVO> listByUserId(Long userId);

    /** 新增紧急联系人 */
    EmergencyContactVO create(Long userId, EmergencyContactRequest request);

    /** 编辑紧急联系人 */
    EmergencyContactVO update(Long userId, Long contactId, EmergencyContactRequest request);

    /** 删除紧急联系人 */
    void delete(Long userId, Long contactId);
}
