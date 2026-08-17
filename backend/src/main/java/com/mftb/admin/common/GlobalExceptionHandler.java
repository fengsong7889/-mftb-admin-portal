package com.mftb.admin.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

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

    /** 唯一键冲突: 并发写入或历史残留时给出友好提示, 避免暴露 "系统繁忙" */
    @ExceptionHandler(DuplicateKeyException.class)
    public Result<Void> handleDuplicateKeyException(DuplicateKeyException e) {
        log.warn("唯一键冲突: {}", e.getMessage());
        return Result.error(ResultCode.PARAM_ERROR.getCode(), "数据已存在（可能为并发写入或历史残留），请刷新后重试");
    }

    /** 其它未捕获异常（含 SQL 异常） */
    @ExceptionHandler(Exception.class)
    public Result<Void> handleException(Exception e) {
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
            log.error("SQL异常 [{}]: {}", e.getClass().getSimpleName(), exMsg);
            return Result.error(ResultCode.ERROR.getCode(), "数据库异常: " + exMsg);
        }
        log.error("系统异常 [{}]: {}", e.getClass().getSimpleName(), e.getMessage(), e);
        return Result.error(ResultCode.ERROR.getCode(), "系统繁忙, 请稍后重试");
    }

    /** 判断类名是否包含 SQL 关键字 */
    private boolean containsSqlKeyword(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase();
        return lower.contains("sql") || lower.contains("mysql");
    }
}
