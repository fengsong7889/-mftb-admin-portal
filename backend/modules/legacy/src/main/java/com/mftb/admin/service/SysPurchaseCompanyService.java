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

    /** 新增购买公司，返回新建 id；code 与 name 必填，code 全局唯一 */
    long create(SysPurchaseCompany company);

    /** 修改购买公司（id 不存在时报错）；改了 code 时会重校唯一性（排除自身） */
    void update(Long id, SysPurchaseCompany company);

    /** 启停购买公司；id 不存在时报错（不像字典那边会校验 status 只能 0/1） */
    void updateStatus(Long id, Integer status);

    /** 删除购买公司；只校是否存在，<b>不校是否仍被耗材/资产档案引用</b> */
    void delete(Long id);
}
