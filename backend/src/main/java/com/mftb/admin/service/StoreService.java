package com.mftb.admin.service;

import com.mftb.admin.dto.OptionVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.StoreQuery;
import com.mftb.admin.dto.StoreRequest;
import com.mftb.admin.dto.StoreVO;

import java.util.List;

/**
 * 门店服务
 */
public interface StoreService {

    /** 分页查询门店 */
    PageResult<StoreVO> list(StoreQuery query);

    /** 按集团查询门店（下拉选项用） */
    List<StoreVO> listByGroupId(Long groupId);

    /** 门店ID/名称搜索下拉选项（选项值为门店ID） */
    List<OptionVO> searchOptions(String keyword);

    /** 门店最后更新人搜索下拉选项 */
    List<OptionVO> searchUpdatedByOptions(String keyword);

    /** 新增门店 */
    StoreVO create(StoreRequest request);

    /** 编辑门店 */
    StoreVO update(Long id, StoreRequest request);

    /** 删除门店 */
    void delete(Long id);
}
