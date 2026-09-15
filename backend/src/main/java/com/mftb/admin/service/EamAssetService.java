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
}
