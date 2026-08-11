package com.mftb.admin.service;

import java.util.Set;

/**
 * 数据范围服务: 解析当前登录用户可见的商家集团编码集合
 * <p>
 * 权限来源: 功能角色授权(role) ∪ 部门授权(department),
 * 超管(role=admin) 返回 null 表示不限制; 无授权返回空集合(严格模式).
 */
public interface DataScopeService {

    /**
     * 解析当前用户可见的 group_code 集合
     *
     * @return null = 超管不限制; 空 Set = 无授权看不到任何数据; 非空 = 可见的商家编码
     */
    Set<String> resolveAuthorizedGroupCodes();

    /** 清空数据范围缓存 (数据授权变更后调用) */
    void evictAll();
}
