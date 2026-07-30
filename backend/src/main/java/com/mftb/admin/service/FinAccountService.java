package com.mftb.admin.service;

import com.mftb.admin.dto.FinAccountQuery;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.FinAccount;

import java.math.BigDecimal;

/**
 * 推广金账户服务
 */
public interface FinAccountService {

    /** 账户余额分页查询 */
    PageResult<FinAccountVO> page(FinAccountQuery query);

    /** 冻结账户 */
    void freeze(String groupId);

    /** 解冻账户 */
    void unfreeze(String groupId);

    /** 获取账户，不存在时以零余额自动建户（首次充值/转入时调用） */
    FinAccount getOrCreate(String groupId, String groupName, String brand);

    /** 查询账户，不存在返回 null */
    FinAccount find(String groupId);

    /** 校验账户可用（不存在或已冻结/已注销时抛业务异常） */
    FinAccount requireUsable(String groupId);

    /** 变更账户余额（虚拟必填，实收为 null 时不动实收余额） */
    void changeBalance(String groupId, BigDecimal virtualDelta, BigDecimal actualDelta);

    /** 更新账户状态 */
    void updateStatus(String groupId, String status);
}
