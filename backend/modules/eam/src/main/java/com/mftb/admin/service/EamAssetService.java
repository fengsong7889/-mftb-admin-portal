package com.mftb.admin.service;

import com.mftb.admin.dto.*;
import java.util.Map;

/**
 * 资产台账（biz_eam_asset）读写服务。
 * <p>
 * 台账记录有两个源头：验收入库后生成（batchId 非空）与本服务直接新增；
 * 两者的可编辑范围不同，详见 {@link #update(long, EamAssetSaveDTO)}。
 */
public interface EamAssetService {
    /** 资产分页查询，分类/品牌/仓库/状态/关键字等筛选条件由 query 承载 */
    PageResult<EamAssetVO> page(EamAssetQuery query);

    /** 按状态聚合的资产数量（列表页状态角标）；调用方需先清空 query.status，否则角标会被当前筛选条件吃掉 */
    Map<String, Long> statusCounts(EamAssetQuery query);

    /** 资产详情 */
    EamAssetVO detail(long id);

    /**
     * 新增资产：状态固定为 idle、来源 self、持有 owned、购入原值 0，
     * 编号为空时按品牌/仓库/分类自动生成。
     */
    long create(EamAssetSaveDTO dto);

    /**
     * 编辑资产（行锁读取）：
     * 存在活跃领用时禁止编辑；验收入库生成的资产（batchId 非空）禁止修改资产编号。
     */
    void update(long id, EamAssetSaveDTO dto);

    /** 删除资产（行锁读取）：仅闲置且无活跃领用的资产可删 */
    void delete(long id);

    /**
     * 资产编号是否唯一；excludeId 用于编辑场景排除自身。
     * 预校验不并发安全，真正的唯一性由 Service 内捕获 DuplicateKeyException 与数据库唯一索引共同兜底。
     */
    boolean isAssetNoUnique(String assetNo, Long excludeId);

    /**
     * 生成資產編號: {品牌編碼}-{倉庫編碼}-{分類碼}-{4位分類內序號}
     * 示例: TB-ZH-0101-0001
     */
    String generateAssetNo(Integer companyBrand, Long locationId, String categoryCode);
}
