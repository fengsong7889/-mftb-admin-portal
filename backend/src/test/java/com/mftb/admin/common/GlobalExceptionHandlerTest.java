package com.mftb.admin.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.converter.HttpMessageNotReadableException;

import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * GlobalExceptionHandler 单元测试
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    @DisplayName("业务异常: 透传业务码与消息")
    void businessException() {
        Result<Void> result = handler.handleBusinessException(new BusinessException(4001, "余额不足"));
        assertThat(result.getCode()).isEqualTo(4001);
        assertThat(result.getMessage()).isEqualTo("余额不足");
    }

    @Test
    @DisplayName("SQL 异常: 不向前端泄露异常详情（回归测试）")
    void sqlExceptionMessageNotLeaked() {
        String sensitive = "Table 'fengsong_test.biz_fin_detail' doesn't exist";
        Result<Void> result = handler.handleException(new SQLException(sensitive));

        assertThat(result.getCode()).isEqualTo(ResultCode.ERROR.getCode());
        assertThat(result.getMessage())
                .doesNotContain(sensitive)
                .doesNotContain("biz_fin_detail");
    }

    @Test
    @DisplayName("MyBatis 包裹的 SQL 根因: 沿 cause 链识别且不外泄")
    void wrappedSqlException() {
        Result<Void> result = handler.handleException(
                new RuntimeException("wrapper", new SQLException("Duplicate column 'secret_col'")));

        assertThat(result.getCode()).isEqualTo(ResultCode.ERROR.getCode());
        assertThat(result.getMessage()).doesNotContain("secret_col");
    }

    @Test
    @DisplayName("普通系统异常: 返回通用提示")
    void genericException() {
        Result<Void> result = handler.handleException(new IllegalStateException("internal detail"));
        assertThat(result.getCode()).isEqualTo(ResultCode.ERROR.getCode());
        assertThat(result.getMessage()).doesNotContain("internal detail");
    }

    @Test
    @DisplayName("唯一键冲突: 返回友好提示")
    void duplicateKey() {
        Result<Void> result = handler.handleDuplicateKeyException(new DuplicateKeyException("dup"));
        assertThat(result.getCode()).isEqualTo(ResultCode.PARAM_ERROR.getCode());
    }

    @Test
    @DisplayName("请求体解析失败: 返回参数错误提示")
    void messageNotReadable() {
        Result<Void> result = handler.handleHttpMessageNotReadable(
                new HttpMessageNotReadableException("bad body"));
        assertThat(result.getCode()).isEqualTo(ResultCode.PARAM_ERROR.getCode());
    }
}
