package com.mftb.admin.service;

import com.mftb.admin.dto.*;
import java.util.Map;

public interface EamAssetService {
    PageResult<EamAssetVO> page(EamAssetQuery query);
    Map<String, Long> statusCounts(EamAssetQuery query);
    EamAssetVO detail(long id);
    long create(EamAssetSaveDTO dto);
    void update(long id, EamAssetSaveDTO dto);
    void delete(long id);
    boolean isAssetNoUnique(String assetNo, Long excludeId);

    /**
     * 生成資產編號: {品牌編碼}-{倉庫編碼}-{分類碼}-{4位分類內序號}
     * 示例: TB-ZH-0101-0001
     */
    String generateAssetNo(Integer companyBrand, Long locationId, String categoryCode);
}
