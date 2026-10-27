package com.mftb.admin.service;

import com.mftb.admin.dto.FinRiskConfigDTO;
import com.mftb.admin.dto.FinRiskQuery;
import com.mftb.admin.dto.FinRiskVO;
import com.mftb.admin.dto.PageResult;

import java.math.BigDecimal;
import java.util.List;

/**
 * 推广金消费风控服务（登记制，两模式）
 * <p>
 * 风控规则:
 * 1. 未登记（无配置）的集团一律不限制，默认视为白名单；
 * 2. 已登记但停用、或无未结清欠款的集团不限制；
 * 3. 已登记且启用的集团按释放模式限额:
 *    repay=仅还款释放、monthly=每月按「各分期批次未付×比例」释放；
 *    全额支付批次（对公转账/赠送）不限制，分期批次已付部分可直接消费；
 * 4. 转账按 FIFO 模拟拆分，触碰含未结清欠款的批次则拦截（对所有集团生效）。
 */
public interface FinRiskService {

    /** 风控模式（释放方式） */
    String RELEASE_REPAY = "repay";
    String RELEASE_MONTHLY = "monthly";

    /** 登记状态 */
    String STATUS_ENABLED = "enabled";
    String STATUS_DISABLED = "disabled";

    /** 充值结算方式：对公转账=全额支付（不限制） */
    String PAY_CORPORATE = "corporate";

    /** 风控额度检查结果（availableAmount 为 null 表示不限额） */
    record FinRiskCheck(boolean limited, String releaseMode, BigDecimal unsettledDebt,
                        BigDecimal paidPool, BigDecimal totalConsumed,
                        BigDecimal monthlyRelease, BigDecimal availableAmount) {
    }

    /** 转账会触碰的欠款批次 */
    record FinTransferBlock(String batchNo, BigDecimal unsettledAmount) {
    }

    /** 计算集团×品牌的风控额度明细 */
    FinRiskCheck check(String groupCode, String brand);

    /** 消费限额校验：受限且超限时抛出业务异常 */
    void requireConsumable(String groupCode, String brand, BigDecimal amount);

    /** 转账欠款批次检查：按 FIFO 模拟拆分，返回会触碰的欠款批次（空=放行） */
    List<FinTransferBlock> checkTransferBatches(String groupCode, BigDecimal amount);

    /** 消费风控列表（分页，仅已登记集团） */
    PageResult<FinRiskVO> page(FinRiskQuery query);

    /** 单集团风控配置与额度明细（配置弹窗/页面提示用） */
    FinRiskVO getConfig(String groupCode, String brand);

    /** 保存风控配置（不存在则新增，新增默认启用） */
    void saveConfig(FinRiskConfigDTO dto);

    /** 启用/停用风控登记（停用后不限制消费） */
    void updateStatus(String groupCode, String brand, String status);
}
