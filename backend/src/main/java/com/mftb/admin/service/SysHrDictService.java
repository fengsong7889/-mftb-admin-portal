package com.mftb.admin.service;

import com.mftb.admin.entity.SysHrDict;

import java.util.List;
import java.util.Map;

/**
 * HR 人事通用字典服务
 * 提供雇主法人 / 工作地点 / 人员类别等字典的列表、下拉、按 code 取名称与增删改。
 */
public interface SysHrDictService {

    /** 按类型查询（status 为 null 返回全部；dictType 为 null 返回全部类型） */
    List<SysHrDict> list(String dictType, Integer status);

    /** 指定类型的启用下拉：[{id, code, name, nameEn, parentCode}] */
    List<Map<String, Object>> listOptions(String dictType);

    /** 按 dictType+code 取名称，找不到返回原 code（用于把已存的 code 回显为中文） */
    String getNameByCode(String dictType, String code);

    Long create(SysHrDict dict);

    void update(Long id, SysHrDict dict);

    void updateStatus(Long id, Integer status);

    void delete(Long id);
}
