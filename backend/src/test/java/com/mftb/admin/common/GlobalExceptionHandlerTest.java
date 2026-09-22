package com.mftb.admin.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.MethodParameter;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

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
        String sensitive = "Table 'fengsong.biz_fin_detail' doesn't exist";
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

    @ParameterizedTest
    @ValueSource(strings = {"repairer-options", "9223372036854775808"})
    @DisplayName("路径或查询参数转换失败：返回参数错误且不泄露输入和内部异常")
    void typeMismatchDoesNotLeakDetails(String input) {
        MethodArgumentTypeMismatchException exception = new MethodArgumentTypeMismatchException(
                input, Long.class, "id", mock(MethodParameter.class),
                new NumberFormatException("internal conversion detail: " + input));

        Result<Void> result = handler.handleMethodArgumentTypeMismatch(exception);

        assertThat(result.getCode()).isEqualTo(ResultCode.PARAM_ERROR.getCode());
        assertThat(result.getMessage())
                .isEqualTo("請求參數格式錯誤，請檢查數據類型及取值範圍")
                .doesNotContain(input, "NumberFormatException", "internal conversion detail");
    }

    @Test
    @DisplayName("未匹配路由：两类异常均返回 404，且不回显路径")
    void missingRouteReturnsNotFound() {
        for (Exception exception : new Exception[]{
                new NoHandlerFoundException("GET", "/internal-path", new HttpHeaders()),
                new NoResourceFoundException(HttpMethod.GET, "internal-path")
        }) {
            ResponseEntity<Result<Void>> response = handler.handleNotFound(exception);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(response.getBody()).isNotNull();
            assertThat(response.getBody().getCode()).isEqualTo(ResultCode.NOT_FOUND.getCode());
            assertThat(response.getBody().getMessage()).doesNotContain("internal-path");
        }
    }

    @Test
    @DisplayName("错误 HTTP 方法：返回 405 并保留 Allow 响应头")
    void unsupportedMethodPreservesAllowHeader() {
        ResponseEntity<Result<Void>> response = handler.handleMethodNotAllowed(
                new HttpRequestMethodNotSupportedException("PUT", List.of("GET", "HEAD")));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(response.getHeaders().getAllow()).containsExactlyInAnyOrder(HttpMethod.GET, HttpMethod.HEAD);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getCode()).isEqualTo(ResultCode.METHOD_NOT_ALLOWED.getCode());
        assertThat(response.getBody().getMessage()).isEqualTo("不支援此請求方法");
    }

    @Test
    @DisplayName("请求体解析失败: 返回参数错误提示")
    void messageNotReadable() {
        Result<Void> result = handler.handleHttpMessageNotReadable(
                new HttpMessageNotReadableException("bad body"));
        assertThat(result.getCode()).isEqualTo(ResultCode.PARAM_ERROR.getCode());
    }
}
