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

    /**
     * 新增字典项，返回新建 id。dictType / code / name 三项均必填，
     * 且 (dictType, code) 组合必须唯一。
     */
    Long create(SysHrDict dict);

    /**
     * 修改字典项（id 不存在时报错）。
     * <p>
     * ⚠️ 与 {@link SysPurchaseCompanyService#update} 不同，本方法**不重校验 code 唯一性**，
     * 编辑时可以把 code 改到与同类型另一项重复。
     */
    void update(Long id, SysHrDict dict);

    /** 启停字典项；状态值仅接受 0/1，其他值报错 */
    void updateStatus(Long id, Integer status);

    /** 删除字典项；只校项是否存在，不校是否仍被员工档案引用 */
    void delete(Long id);
}
