package com.mftb.admin.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * 全局异常处理器
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 业务异常 */
    @ExceptionHandler(BusinessException.class)
    public Result<Void> handleBusinessException(BusinessException e) {
        log.warn("业务异常: {}", e.getMessage());
        return Result.error(e.getCode(), e.getMessage());
    }

    /** 权限不足 */
    @ExceptionHandler(PermissionDeniedException.class)
    public Result<Void> handlePermissionDeniedException(PermissionDeniedException e) {
        log.warn("权限拒绝: {}", e.getMessage());
        return Result.error(ResultCode.FORBIDDEN.getCode(), e.getMessage());
    }

    /** 参数校验异常 (@RequestBody) */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<Void> handleValidException(MethodArgumentNotValidException e) {
        FieldError fieldError = e.getBindingResult().getFieldError();
        String message = fieldError != null ? fieldError.getDefaultMessage() : "参数校验失败";
        return Result.error(ResultCode.PARAM_ERROR.getCode(), message);
    }

    /** 参数绑定异常 (表单) */
    @ExceptionHandler(BindException.class)
    public Result<Void> handleBindException(BindException e) {
        FieldError fieldError = e.getBindingResult().getFieldError();
        String message = fieldError != null ? fieldError.getDefaultMessage() : "参数绑定失败";
        return Result.error(ResultCode.PARAM_ERROR.getCode(), message);
    }

    /** 路径或查询参数转换失败，包括数字超出目标类型范围。 */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public Result<Void> handleMethodArgumentTypeMismatch(MethodArgumentTypeMismatchException e) {
        // 不回显原始输入及底层异常，避免泄露数据或将非法参数记为系统故障。
        log.warn("请求参数类型或范围错误: {}", e.getName());
        return Result.error(ResultCode.PARAM_ERROR.getCode(), "請求參數格式錯誤，請檢查數據類型及取值範圍");
    }

    /** 路由未匹配：兼容开启和关闭静态资源映射的场景。 */
    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    public ResponseEntity<Result<Void>> handleNotFound(Exception e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Result.error(ResultCode.NOT_FOUND.getCode(), "請求的資源不存在"));
    }

    /** 请求方法不匹配时保留 405 及 Allow 响应头。 */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Result<Void>> handleMethodNotAllowed(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).headers(e.getHeaders())
                .body(Result.error(ResultCode.METHOD_NOT_ALLOWED.getCode(), "不支援此請求方法"));
    }

    /** 请求体反序列化失败（如类型不匹配） */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public Result<Void> handleHttpMessageNotReadable(HttpMessageNotReadableException e) {
        log.warn("请求体解析失败: {}", e.getMessage());
        return Result.error(ResultCode.PARAM_ERROR.getCode(), "請求參數格式錯誤，請檢查數據類型後重試");
    }

    /** 唯一键冲突: 并发写入或历史残留时给出友好提示, 避免暴露 "系统繁忙" */
    @ExceptionHandler(DuplicateKeyException.class)
    public Result<Void> handleDuplicateKeyException(DuplicateKeyException e) {
        log.warn("唯一键冲突: {}", e.getMessage());
        return Result.error(ResultCode.PARAM_ERROR.getCode(), "數據已存在（可能為並發寫入或歷史殘留），請刷新後重試");
    }

    /** Spring 数据访问异常（含 BadSqlGrammarException 等 MyBatis 包装的 SQL 异常） */
    @ExceptionHandler(DataAccessException.class)
    public Result<Void> handleDataAccessException(DataAccessException e) {
        log.error("数据访问异常 [{}]: {}", e.getClass().getSimpleName(), e.getMessage(), e);
        return Result.error(ResultCode.ERROR.getCode(), "數據庫操作異常, 請稍後重試");
    }

    /**
     * 客户端提前断开连接：浏览器刷新/关闭页面、前端超时或 AbortController 取消请求、网关超时等，
     * 容器写响应时抛 Broken pipe。这不是服务端故障，且连接已不可写（再次写出只会二次失败），
     * 因此只记 debug 且不带堆栈，避免生产日志被成片伪 ERROR 淹没。
     */
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void handleClientDisconnect(AsyncRequestNotUsableException e, HttpServletRequest request) {
        logClientDisconnect(e, request);
    }

    /** 其它未捕获异常 */
    @ExceptionHandler(Exception.class)
    public Result<Void> handleException(Exception e, HttpServletRequest request, HttpServletResponse response) {
        // 响应已提交（含客户端已断开导致写出中断）时无法再写错误体：直接返回 null，
        // 由 Spring 标记请求已处理，不再尝试第二次写出（否则只会在日志里追加一条失败记录）。
        if (response.isCommitted()) {
            logClientDisconnect(e, request);
            return null;
        }
        // 沿 cause 链向下查找，定位真正的异常根因（MyBatis 常将 SQLException 包裹为 MyBatisSystemException）
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String exType = root.getClass().getSimpleName();
        String exMsg = root.getMessage();
        // 根因或外层异常类名含 Sql/SQL/MySQL → 视为数据库异常
        boolean isSql = containsSqlKeyword(e.getClass().getSimpleName())
                || containsSqlKeyword(exType);
        if (isSql) {
            // 异常详情仅记录在服务端日志，不返回给前端，避免暴露表结构/SQL 细节
            log.error("SQL异常 [{}]: {}", e.getClass().getSimpleName(), exMsg, e);
            return Result.error(ResultCode.ERROR.getCode(), "數據庫操作異常, 請稍後重試");
        }
        log.error("系统异常 [{}]: {}", e.getClass().getSimpleName(), e.getMessage(), e);
        return Result.error(ResultCode.ERROR.getCode(), "系統繁忙, 請稍後重試");
    }

    /** 记录客户端断连（只一行、不带堆栈）：生产默认 info 级别不输出，需定位时临时设 LOG_LEVEL=debug */
    private void logClientDisconnect(Throwable e, HttpServletRequest request) {
        log.debug("客户端已断开，跳过响应写出: {} {} ({})",
                request.getMethod(), request.getRequestURI(), e.getMessage());
    }

    /** 判断类名是否包含 SQL 关键字 */
    private boolean containsSqlKeyword(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase();
        return lower.contains("sql") || lower.contains("mysql");
    }
}
