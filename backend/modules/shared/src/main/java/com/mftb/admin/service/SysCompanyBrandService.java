package com.mftb.admin.service;

import com.mftb.admin.entity.SysCompanyBrand;

import java.util.List;
import java.util.Map;

/**
 * 公司品牌配置服务
 * 提供品牌列表查询、按 ID 查编码/标签等能力
 */
public interface SysCompanyBrandService {

    /**
     * 查询全部公司品牌（按 sort_order 升序）
     *
     * @param status 可选状态过滤：null=全部, 1=仅启用
     */
    List<SysCompanyBrand> list(Integer status);

    /**
     * 查询全部启用品牌，返回前端 Select 所需格式
     *
     * @return [{id, code, labelZh, labelEn}]
     */
    List<Map<String, Object>> listOptions();

    /**
     * 按 ID 获取品牌编码（用于资产编号生成）
     *
     * @param brandId 品牌 ID（即 sys_company_brand.id）
     * @return 品牌编码（如 TB/MF），不存在时返回 "XX"
     */
    String getCodeById(Long brandId);

    /**
     * 按 ID 获取品牌中文标签
     *
     * @param brandId 品牌 ID
     * @return 中文标签（如 閃蜂/mFood），不存在时返回空字符串
     */
    String getLabelById(Long brandId);

    /**
     * 新增品牌
     */
    long create(SysCompanyBrand brand);

    /**
     * 更新品牌
     */
    void update(Long id, SysCompanyBrand brand);

    /**
     * 启用/停用
     */
    void updateStatus(Long id, Integer status);

    /**
     * 删除品牌（逻辑删除）
     */
    void delete(Long id);
}
