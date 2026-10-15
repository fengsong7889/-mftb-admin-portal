package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.ResultCode;

import java.util.Objects;

/**
 * 原子幂等绑定键（Batch 3 / rdm:schema:v3.2）。
 * <p>{@link RdmIdempotentService#executeOnce} 用它唯一标识「谁(userId) 对哪个资源(resourceKey)
 * 以哪个客户端请求(clientRequestId) 做哪类操作(bizType)，且请求内容(requestHash)是什么」。
 *
 * <p>五个字段共同构成幂等身份：
 * <ul>
 *   <li>{@code userId}：认证用户，跨用户不得回放（userId 也参与占位唯一键派生，结构上隔离不同用户）；</li>
 *   <li>{@code bizType}：业务类型（如 release_apply / test_submit），区分不同动作；</li>
 *   <li>{@code resourceKey}：被保护的业务资源标识（如 release_batch:123）；</li>
 *   <li>{@code clientRequestId}：客户端生成的幂等请求ID，重试时保持不变；</li>
 *   <li>{@code requestHash}：请求体规范化稳定序列化后的 SHA-256，用于「同键不同内容」的冲突判定。</li>
 * </ul>
 *
 * <p>占位唯一键（写入 {@code rdm_idempotent_log.request_id}）由前四项派生：
 * {@code SHA-256(userId|bizType|resourceKey|clientRequestId)}，复用既有唯一索引 {@code uk_request_id}，
 * 不新增索引；{@code requestHash} 单独存 {@code request_hash} 列，只用于内容一致性判定，不参与占位键派生。
 *
 * <p>本类不可变；用 {@link #builder()} 构造，构造时即校验必填，避免半初始化键进入事务。
 */
public final class IdempotentKey {

    private final Long userId;
    private final String bizType;
    private final String resourceKey;
    private final String clientRequestId;
    private final String requestHash;

    private IdempotentKey(Builder b) {
        this.userId = b.userId;
        this.bizType = b.bizType;
        this.resourceKey = b.resourceKey;
        this.clientRequestId = b.clientRequestId;
        this.requestHash = b.requestHash;
    }

    public Long getUserId() {
        return userId;
    }

    public String getBizType() {
        return bizType;
    }

    public String getResourceKey() {
        return resourceKey;
    }

    public String getClientRequestId() {
        return clientRequestId;
    }

    public String getRequestHash() {
        return requestHash;
    }

    public static Builder builder() {
        return new Builder();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof IdempotentKey)) {
            return false;
        }
        IdempotentKey that = (IdempotentKey) o;
        return Objects.equals(userId, that.userId)
                && Objects.equals(bizType, that.bizType)
                && Objects.equals(resourceKey, that.resourceKey)
                && Objects.equals(clientRequestId, that.clientRequestId)
                && Objects.equals(requestHash, that.requestHash);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, bizType, resourceKey, clientRequestId, requestHash);
    }

    @Override
    public String toString() {
        // 不回显 requestHash 全文，避免日志噪音；只给前 8 位便于关联排查
        return "IdempotentKey{userId=" + userId + ", bizType=" + bizType
                + ", resourceKey=" + resourceKey + ", clientRequestId=" + clientRequestId
                + ", requestHash=" + (requestHash == null ? "null" : requestHash.substring(0, Math.min(8, requestHash.length())))
                + "}";
    }

    /** {@link IdempotentKey} 构造器，build 时强校验五要素齐全。 */
    public static final class Builder {
        private Long userId;
        private String bizType;
        private String resourceKey;
        private String clientRequestId;
        private String requestHash;

        public Builder userId(Long userId) {
            this.userId = userId;
            return this;
        }

        public Builder bizType(String bizType) {
            this.bizType = bizType;
            return this;
        }

        public Builder resourceKey(String resourceKey) {
            this.resourceKey = resourceKey;
            return this;
        }

        public Builder clientRequestId(String clientRequestId) {
            this.clientRequestId = clientRequestId;
            return this;
        }

        public Builder requestHash(String requestHash) {
            this.requestHash = requestHash;
            return this;
        }

        public IdempotentKey build() {
            if (userId == null || userId <= 0) {
                throw new BusinessException(ResultCode.PARAM_ERROR.getCode(), "幂等鍵缺少認證用戶");
            }
            require(bizType, "bizType");
            require(resourceKey, "resourceKey");
            require(clientRequestId, "clientRequestId");
            require(requestHash, "requestHash");
            return new IdempotentKey(this);
        }

        private static void require(String value, String name) {
            if (value == null || value.isBlank()) {
                throw new BusinessException(ResultCode.PARAM_ERROR.getCode(), "幂等鍵缺少 " + name);
            }
        }
    }
}
