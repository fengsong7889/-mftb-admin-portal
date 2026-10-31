package com.mftb.admin.service;

import com.mftb.admin.entity.BizSearchGuidance;

import java.util.List;

/** 搜索引导配置服务 */
public interface BizSearchGuidanceService {

    /** 条件查询（含停用，管理用）；参数为 null 表示不过滤该维度。 */
    List<BizSearchGuidance> list(Integer wordType, String brand, Integer surface, Integer status);

    long create(BizSearchGuidance guidance);

    void update(Long id, BizSearchGuidance guidance);

    void updateStatus(Long id, Integer status);

    void delete(Long id);
}
