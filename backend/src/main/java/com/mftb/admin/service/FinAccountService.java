package com.mftb.admin.service;

import com.mftb.admin.dto.FinAccountQuery;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.FinAccount;

import java.math.BigDecimal;
import java.util.List;

/**
 * 推广金账户服务
 */
public interface FinAccountService {

    /** 账户余额分页查询（以集团×品牌派生，集团有对应品牌门店才展示） */
    PageResult<FinAccountVO> page(FinAccountQuery query);

    /** 冻结账户 */
    void freeze(String groupId, String brand);

    /** 解冻账户 */
    void unfreeze(String groupId, String brand);

    /** 获取账户，不存在时以零余额自动建户（首次充值/转入时调用） */
    FinAccount getOrCreate(String groupId, String groupName, String brand);

    /** 查询账户，不存在返回 null */
    FinAccount find(String groupId, String brand);

    /** 校验账户可用（不存在或已冻结/已注销时抛业务异常） */
    FinAccount requireUsable(String groupId, String brand);

    /** 变更账户余额（虚拟必填，实收为 null 时不动实收余额） */
    void changeBalance(String groupId, String brand, BigDecimal virtualDelta, BigDecimal actualDelta);

    /** 更新账户状态 */
    void updateStatus(String groupId, String brand, String status);

    /** 诊断用：按集团编码查询所有账户原始记录 */
    List<FinAccount> findAccountsByGroupCode(String groupCode);

    /** 数据修复：直接设置账户余额（仅用于修正错误数据） */
    void fixBalance(String groupId, String brand, FinAccount account);
}
