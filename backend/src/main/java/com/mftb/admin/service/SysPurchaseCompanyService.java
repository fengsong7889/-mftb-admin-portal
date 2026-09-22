package com.mftb.admin.service;

import com.mftb.admin.entity.SysPurchaseCompany;

import java.util.List;
import java.util.Map;

/**
 * 购买公司字典服务
 * 提供公司列表/下拉、名称解析与增删改，供耗材/资产业务按公司核算使用。
 */
public interface SysPurchaseCompanyService {

    /** 查询全部（status=1 仅启用；null 全部），按 sort_order 升序 */
    List<SysPurchaseCompany> list(Integer status);

    /** 启用公司下拉：[{id, code, name, shortName}] */
    List<Map<String, Object>> listOptions();

    /** 按 ID 取公司全称（快照/回显用），不存在返回空串 */
    String getNameById(Long id);

    long create(SysPurchaseCompany company);

    void update(Long id, SysPurchaseCompany company);

    void updateStatus(Long id, Integer status);

    void delete(Long id);
}
