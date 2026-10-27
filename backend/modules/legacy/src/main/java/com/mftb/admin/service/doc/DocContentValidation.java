package com.mftb.admin.service.doc;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocNativeDTO.Save;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Pattern;

/** 原文不截断、不记录日志；高置信凭据命中只报告类型，不回显内容。 */
@Service
@RequiredArgsConstructor
public class DocContentValidation {
    public static final int MAX_BYTES=2*1024*1024;
    private static final Pattern SECRET=Pattern.compile("-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?i:authorization\\s*:\\s*bearer\\s+eyJ[A-Za-z0-9_.-]{30,}|(?:api[_-]?key|jwt_secret|db_password)\\s*[:=]\\s*[\\\"']?[A-Za-z0-9_./+-]{24,})");
    private final Validator validator;
    /**
     * 库内 JSON 专用：不能复用 Spring 容器里的 ObjectMapper。
     * 后者把 LocalDateTime 序列化为毫秒时间戳（JacksonConfig），写进回执后再反序列化会因
     * “raw timestamp not allowed for LocalDateTime”失败，导致同键幂等重放 500。
     */
    private static final ObjectMapper STORAGE = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    public void validate(Object value) {
        if (value == null || !validator.validate(value).isEmpty()) throw new BusinessException(400, "輸入欄位缺失或格式不正確");
    }
    /** 正文安全校验：供 v2 Save 与 v3 DocWrite 共用，文件型文档允许正文为空。 */
    public void markdown(String title, String summary, String markdown) {
        if (markdown == null) return;
        if (markdown.getBytes(StandardCharsets.UTF_8).length>MAX_BYTES) throw new BusinessException(413, "Markdown 原文不能超過 2 MiB");
        if (SECRET.matcher(markdown).find() || SECRET.matcher(n(title)+n(summary)).find())
            throw new BusinessException(400, "內容疑似包含憑據或私鑰，請移除敏感值後再保存");
    }
    public Save content(Save input) {
        validate(input);
        markdown(input.title(), input.summary(), input.markdown());
        return new Save(input.spaceId(), input.title().trim(), n(input.summary()), input.markdown(),
                input.tags()==null ? List.of() : input.tags().stream().map(String::trim).distinct().toList(),
                n(input.systemCode()),n(input.menuKey()),n(input.originalFilename()),input.changeReason().trim(),input.sourceSessionKey(),input.expectedVersion());
    }
    public String contentHash(Save content) {
        return hash(encode(List.of(content.title(),content.summary(),content.markdown(),content.tags(),content.systemCode(),content.menuKey(),content.originalFilename())));
    }
    public String encode(Object object) {
        try { return STORAGE.writeValueAsString(object); }
        catch (JsonProcessingException e) { throw new IllegalStateException("文档序列化失败", e); }
    }
    public <T> T decode(String text, Class<T> type) {
        try { return STORAGE.readValue(text,type); }
        catch (JsonProcessingException e) { throw new IllegalStateException("文档存储内容无法读取", e); }
    }
    public static String n(String value) { return value==null ? "" : value; }
    public static String hash(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
