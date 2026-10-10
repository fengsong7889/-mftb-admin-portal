package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.controller.FinAccountController;
import com.mftb.admin.dto.FinAccountBalanceVO;
import com.mftb.admin.entity.FinAccount;
import com.mftb.admin.mapper.BizMerchantGroupMapper;
import com.mftb.admin.mapper.FinAccountMapper;
import com.mftb.admin.service.impl.FinAccountServiceImpl;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;

import java.math.BigDecimal;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 下單頁推廣金餘額查詢（{@code GET /api/fin/accounts/balance}）行為与權限錨點測試。
 * <p>
 * 背景：廣告銷售購買頁需要展示並預校驗商戶推廣金餘額，但只應拿到「單個集團+品牌」的餘額，
 * 不得因此獲得翻閱全部集團財務數據的列表能力。
 */
@DisplayName("FinAccount: 下單頁餘額只讀接口")
class FinAccountBalanceQueryTest {

    private FinAccountMapper accountMapper;
    private DataScopeService dataScopeService;
    private FinAccountService service;

    @BeforeEach
    void setUp() {
        accountMapper = mock(FinAccountMapper.class);
        dataScopeService = mock(DataScopeService.class);
        service = new FinAccountServiceImpl(
                accountMapper, mock(BizMerchantGroupMapper.class), mock(OperatorResolver.class), dataScopeService);
    }

    private FinAccount account(String groupCode, String brand, String balance, String status) {
        FinAccount acc = new FinAccount();
        acc.setGroupCode(groupCode);
        acc.setBrand(brand);
        acc.setVirtualBalance(new BigDecimal(balance));
        acc.setStatus(status);
        return acc;
    }

    @Test
    @DisplayName("有賬戶記錄：原樣返回餘額與狀態")
    void returnsRealBalance() {
        when(dataScopeService.resolveAuthorizedGroupCodes()).thenReturn(null);
        when(accountMapper.selectOne(ArgumentMatchers.<Wrapper<FinAccount>>any()))
                .thenReturn(account("MT0001", "mFood", "10", "normal"));

        FinAccountBalanceVO vo = service.getBalance("MT0001", "mFood");

        assertTrue(vo.isExists(), "有記錄時 exists 必須為 true");
        assertEquals(0, new BigDecimal("10").compareTo(vo.getVirtualBalance()));
        assertEquals("normal", vo.getStatus());
    }

    @Test
    @DisplayName("無賬戶記錄：exists=false 且餘額為 0（與下單校驗口徑一致，不是取不到）")
    void missingAccountIsZeroBalance() {
        when(dataScopeService.resolveAuthorizedGroupCodes()).thenReturn(null);
        when(accountMapper.selectOne(ArgumentMatchers.<Wrapper<FinAccount>>any())).thenReturn(null);

        FinAccountBalanceVO vo = service.getBalance("MT0001", "mFood");

        assertFalse(vo.isExists());
        assertEquals(0, BigDecimal.ZERO.compareTo(vo.getVirtualBalance()));
    }

    @Test
    @DisplayName("只讀：不得為查餘額而自動建戶")
    void neverCreatesAccount() {
        when(dataScopeService.resolveAuthorizedGroupCodes()).thenReturn(null);
        when(accountMapper.selectOne(ArgumentMatchers.<Wrapper<FinAccount>>any())).thenReturn(null);

        service.getBalance("MT0001", "mFood");

        verify(accountMapper, never()).insert(any(FinAccount.class));
        verify(accountMapper, never()).updateById(any(FinAccount.class));
    }

    @Test
    @DisplayName("數據權限不含該集團：拒絕且不查庫（與下單鏈路 requireGroupAccess 同源）")
    void deniesGroupOutsideDataScope() {
        when(dataScopeService.resolveAuthorizedGroupCodes()).thenReturn(Set.of("MT0009"));

        assertThrows(BusinessException.class, () -> service.getBalance("MT0001", "mFood"));
        verify(accountMapper, never()).selectOne(ArgumentMatchers.<Wrapper<FinAccount>>any());
    }

    @Test
    @DisplayName("數據權限為空集合：一律拒絕")
    void deniesWhenNoAuthorizedGroup() {
        when(dataScopeService.resolveAuthorizedGroupCodes()).thenReturn(Set.of());

        assertThrows(BusinessException.class, () -> service.getBalance("MT0001", "mFood"));
    }

    @Test
    @DisplayName("權限錨點：餘額接口對 ad-sales 只讀回退開放，列表接口仍只認 account-balance")
    void anchorAllowsSalesReadonlyFallbackOnlyOnBalanceEndpoint() throws NoSuchMethodException {
        RequirePermission balance = FinAccountController.class
                .getMethod("balance", String.class, String.class)
                .getAnnotation(RequirePermission.class);
        assertEquals("account-balance", balance.menu());
        assertArrayEquals(new String[] { "ad-sales" }, balance.anyOf(), "餘額接口需允許廣告銷售只讀回退");
        assertEquals("view", balance.action(), "回退只適用於查看");

        RequirePermission page = FinAccountController.class
                .getMethod("page", com.mftb.admin.dto.FinAccountQuery.class)
                .getAnnotation(RequirePermission.class);
        assertEquals("account-balance", page.menu());
        assertEquals(0, page.anyOf().length, "列表接口不得對其他菜單開放，否則銷售可枚舉全部集團餘額");
    }
}
