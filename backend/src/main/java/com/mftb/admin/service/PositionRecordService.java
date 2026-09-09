package com.mftb.admin.service;

import com.mftb.admin.dto.PositionRecordRequest;
import com.mftb.admin.dto.PositionRecordVO;

import java.util.List;

/**
 * 职务记录服务
 */
public interface PositionRecordService {

    /** 查询某员工的职务记录列表（按 effectiveSeq DESC） */
    List<PositionRecordVO> listByUserId(Long userId);

    /** 新增职务记录（自动生成 effectiveSeq） */
    PositionRecordVO create(Long userId, PositionRecordRequest request);

    /** 编辑职务记录（effectiveSeq +1） */
    PositionRecordVO update(Long userId, Long recordId, PositionRecordRequest request);

    /** 删除职务记录 */
    void delete(Long userId, Long recordId);
}
