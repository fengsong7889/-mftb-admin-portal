package com.mftb.admin.service;

import com.mftb.admin.dto.PositionRequest;
import com.mftb.admin.dto.PositionVO;

import java.util.List;

/**
 * 职位服务
 */
public interface PositionService {

    /** 查询全部职位 */
    List<PositionVO> list();

    /** 新增职位 */
    PositionVO create(PositionRequest request);

    /** 编辑职位 */
    PositionVO update(Long id, PositionRequest request);

    /** 删除职位 */
    void delete(Long id);
}
