package com.mftb.admin.service;

import com.mftb.admin.dto.MerchantGroupQuery;
import com.mftb.admin.dto.MerchantGroupRequest;
import com.mftb.admin.dto.MerchantGroupVO;
import com.mftb.admin.dto.OptionVO;
import com.mftb.admin.dto.PageResult;

import java.util.List;

/**
 * 商户集团服务
 */
public interface MerchantGroupService {

    /** 分页查询集团 */
    PageResult<MerchantGroupVO> list(MerchantGroupQuery query);

    /** 查询全部集团（下拉选项用） */
    List<MerchantGroupVO> listAll();

    /** 集团ID/名称搜索下拉选项（选项值为集团ID） */
    List<OptionVO> searchOptions(String keyword);

    /** 集团最后更新人搜索下拉选项 */
    List<OptionVO> searchUpdatedByOptions(String keyword);

    /** 新增集团 */
    MerchantGroupVO create(MerchantGroupRequest request);

    /** 编辑集团 */
    MerchantGroupVO update(Long id, MerchantGroupRequest request);

    /** 删除集团(存在关联门店时禁止删除) */
    void delete(Long id);
}
