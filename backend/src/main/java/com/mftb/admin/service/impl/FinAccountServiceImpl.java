package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.FinAccountQuery;
import com.mftb.admin.dto.FinAccountVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.BizMerchantGroup;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.FinAccountMapper;
import com.mftb.admin.service.FinAccountService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.List;

/**
 * 推广金账户服务实现
 */
@Service
@RequiredArgsConstructor
public class FinAccountServiceImpl implements FinAccountService {

    /** 账户状态 */
    public static final String STATUS_NORMAL = "normal";
    public static final String STATUS_FROZEN = "frozen";
    public static final String STATUS_MERGE_FROZEN = "mergeFrozen";
    public static final String STATUS_CANCELLED = "cancelled";

    private final FinAccountMapper accountMapper;
    private final BizMerchantGroupMapper groupMapper;
    private final OperatorResolver operatorResolver;

    @Override
    public PageResult<FinAccountVO> page(FinAccountQuery query) {
        // 以集团管理数据为源按「集团×品牌」派生：集团有对应品牌门店才展示，未开户显示零余额
        long total = accountMapper.countDerived(query.getGroupId(), query.getGroupName(),
                query.getBrand(), query.getStatus());
        long offset = (long) (query.getPage() - 1) * query.getSize();
        List<FinAccountVO> records = total == 0 ? List.of()
                : accountMapper.selectDerivedPage(query.getGroupId(), query.getGroupName(),
                        query.getBrand(), query.getStatus(), offset, query.getSize());
        return new PageResult<>(records, total);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void freeze(String groupId, String brand) {
        // 尚未开户的集团×品牌组合先零余额建户再冻结
        FinAccount account = getOrCreate(groupId, null, brand);
        if (STATUS_MERGE_FROZEN.equals(account.getStatus())) {
            throw new BusinessException("该账户处于合并冻结中，请先处理合并流程");
        }
        if (STATUS_CANCELLED.equals(account.getStatus())) {
            throw new BusinessException("该账户已注销，无法冻结");
        }
        account.setStatus(STATUS_FROZEN);
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.updateById(account);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void unfreeze(String groupId, String brand) {
        FinAccount account = findByGroupBrand(groupId, brand);
        if (account == null) {
            // 未开户即默认正常状态，无需解冻
            return;
        }
        if (STATUS_MERGE_FROZEN.equals(account.getStatus())) {
            throw new BusinessException("合并冻结账户需通过商户合并流程解冻");
        }
        if (STATUS_CANCELLED.equals(account.getStatus())) {
            throw new BusinessException("该账户已注销，无法解冻");
        }
        account.setStatus(STATUS_NORMAL);
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.updateById(account);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FinAccount getOrCreate(String groupId, String groupName, String brand) {
        FinAccount account = findByGroupBrand(groupId, brand);
        if (account != null) {
            return account;
        }
        account = new FinAccount();
        account.setGroupCode(groupId);
        account.setGroupName(StringUtils.hasText(groupName) ? groupName : resolveGroupName(groupId));
        account.setBrand(brand);
        account.setVirtualBalance(BigDecimal.ZERO);
        account.setActualBalance(BigDecimal.ZERO);
        account.setStatus(STATUS_NORMAL);
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.insert(account);
        return account;
    }

    @Override
    public FinAccount find(String groupId, String brand) {
        return findByGroupBrand(groupId, brand);
    }

    @Override
    public FinAccount requireUsable(String groupId, String brand) {
        // 集团有门店即视为已开通账户（列表按集团×品牌派生零余额行），
        // 未充值前无账户记录，按余额为 0 提示，避免「尚未开通」文案让人误解
        FinAccount account = findByGroupBrand(groupId, brand);
        if (account == null) {
            throw new BusinessException("集团 " + groupId + " 品牌 " + brandLabel(brand) + " 推广金账户余额为 0，无法发起资金操作，请先充值");
        }
        if (STATUS_FROZEN.equals(account.getStatus())) {
            throw new BusinessException("集团 " + groupId + " 品牌 " + brandLabel(brand) + " 账户已冻结，无法发起资金操作");
        }
        if (STATUS_MERGE_FROZEN.equals(account.getStatus())) {
            throw new BusinessException("集团 " + groupId + " 品牌 " + brandLabel(brand) + " 账户处于合并冻结中，无法发起资金操作");
        }
        if (STATUS_CANCELLED.equals(account.getStatus())) {
            throw new BusinessException("集团 " + groupId + " 品牌 " + brandLabel(brand) + " 账户已注销，无法发起资金操作");
        }
        return account;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeBalance(String groupId, String brand, BigDecimal virtualDelta, BigDecimal actualDelta) {
        FinAccount account = requireAccount(groupId, brand);
        if (virtualDelta != null) {
            account.setVirtualBalance(nonNull(account.getVirtualBalance()).add(virtualDelta));
        }
        if (actualDelta != null) {
            account.setActualBalance(nonNull(account.getActualBalance()).add(actualDelta));
        }
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.updateById(account);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateStatus(String groupId, String brand, String status) {
        FinAccount account = requireAccount(groupId, brand);
        account.setStatus(status);
        account.setUpdatedBy(operatorResolver.currentOperatorName());
        accountMapper.updateById(account);
    }

    /** 按集团ID+品牌查询账户 */
    private FinAccount findByGroupBrand(String groupId, String brand) {
        return accountMapper.selectOne(
                new LambdaQueryWrapper<FinAccount>()
                        .eq(FinAccount::getGroupCode, groupId)
                        .eq(FinAccount::getBrand, brand));
    }

    /** 按集团ID+品牌查询账户，不存在时抛异常 */
    private FinAccount requireAccount(String groupId, String brand) {
        FinAccount account = findByGroupBrand(groupId, brand);
        if (account == null) {
            throw new BusinessException("集团 " + groupId + " 品牌 " + brandLabel(brand) + " 尚未开通推广金账户");
        }
        return account;
    }

    /** 品牌展示名（flashBee=闪蜂） */
    private static String brandLabel(String brand) {
        return "flashBee".equals(brand) ? "闪蜂" : String.valueOf(brand);
    }

    /** 从集团档案补齐集团名称 */
    private String resolveGroupName(String groupId) {
        BizMerchantGroup group = groupMapper.selectOne(
                new LambdaQueryWrapper<BizMerchantGroup>().eq(BizMerchantGroup::getGroupCode, groupId));
        return group != null ? group.getGroupName() : groupId;
    }

    private static BigDecimal nonNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    @Override
    public List<FinAccount> findAccountsByGroupCode(String groupCode) {
        return accountMapper.selectList(
                new LambdaQueryWrapper<FinAccount>()
                        .eq(FinAccount::getGroupCode, groupCode));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void fixBalance(String groupId, String brand, FinAccount account) {
        FinAccount existing = requireAccount(groupId, brand);
        existing.setVirtualBalance(account.getVirtualBalance());
        existing.setActualBalance(account.getActualBalance());
        existing.setUpdatedBy("system-fix");
        accountMapper.updateById(existing);
    }
}
