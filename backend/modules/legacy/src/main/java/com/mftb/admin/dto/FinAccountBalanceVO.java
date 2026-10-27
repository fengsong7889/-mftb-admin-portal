package com.mftb.admin.dto;

import com.mftb.admin.entity.FinAccount;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 推廣金餘額視圖（下單頁專用）。
 * <p>
 * 只返回「單個集團 + 單個品牌」的餘額，不提供列表/枚舉能力：廣告銷售下單頁需要展示並預校驗
 * 商戶推廣金餘額，但不應因此獲得翻閱全部集團財務數據的權限（{@code /fin/accounts} 列表仍只對
 * 賬戶餘額菜單開放）。
 */
@Data
public class FinAccountBalanceVO {

    /** 集團編碼（group_code） */
    private String groupId;

    /** 資產品牌 */
    private String brand;

    /**
     * 是否存在賬戶記錄。
     * <p>false 表示該集團+品牌尚未產生充值/轉入記錄，與下單校驗口徑一致地按餘額 0 呈現
     * （{@code FinAccountService#requireUsable} 對無記錄同樣按「餘額為 0」拒絕）。
     */
    private boolean exists;

    /** 虛擬餘額（可投放推廣的推廣金）；無賬戶記錄時為 0 */
    private BigDecimal virtualBalance;

    /** 賬戶狀態 normal/frozen/mergeFrozen/cancelled；無賬戶記錄時為 null */
    private String status;

    public static FinAccountBalanceVO of(String groupId, String brand, FinAccount account) {
        FinAccountBalanceVO vo = new FinAccountBalanceVO();
        vo.setGroupId(groupId);
        vo.setBrand(brand);
        vo.setExists(account != null);
        vo.setVirtualBalance(account == null || account.getVirtualBalance() == null
                ? BigDecimal.ZERO : account.getVirtualBalance());
        vo.setStatus(account == null ? null : account.getStatus());
        return vo;
    }
}
