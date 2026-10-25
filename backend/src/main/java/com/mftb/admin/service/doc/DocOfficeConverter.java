package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.io.InputStream;

/**
 * Office → PDF 预览转换器（Gotenberg）。
 *
 * <p>只做格式转换，不抽取正文、不执行宏；转换服务必须是内网地址。
 * URL 未配置时明确返回 503，不退回“假装可预览”。
 */
@Slf4j
@Service
public class DocOfficeConverter {
    /** Gotenberg 单次请求上限；与文档空间单文件上限一致，避免把超大文件带进转换服务。 */
    private static final long MAX_BYTES = 50L * 1024 * 1024;
    private static final long MAX_PDF_BYTES = 100L * 1024 * 1024;

    @Value("${doc.office-converter.url:}")
    private String url;
    @Value("${doc.office-converter.timeout-ms:60000}")
    private int timeoutMs;

    private RestTemplate rest;

    @PostConstruct
    void init() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(timeoutMs);
        factory.setReadTimeout(timeoutMs);
        rest = new RestTemplate(factory);
    }

    public boolean configured() {
        return StringUtils.hasText(url);
    }

    public byte[] toPdf(InputStream input, String filename) {
        if (!configured()) throw new BusinessException(503, "Office 在線預覽未配置");
        byte[] source;
        try {
            source = input.readAllBytes();
        } catch (Exception e) {
            throw new BusinessException(500, "讀取 Office 文件失敗");
        }
        if (source.length == 0) throw new BusinessException(400, "Office 文件為空");
        if (source.length > MAX_BYTES) throw new BusinessException(413, "Office 文件過大，無法預覽");
        ByteArrayResource file = new ByteArrayResource(source) {
            @Override
            public String getFilename() {
                return filename;
            }
        };
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("files", file);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        try {
            ResponseEntity<byte[]> response = rest.postForEntity(
                    url.replaceAll("/+$", "") + "/forms/libreoffice/convert",
                    new HttpEntity<>(form, headers), byte[].class);
            byte[] pdf = response.getBody();
            if (!response.getStatusCode().is2xxSuccessful() || pdf == null || pdf.length == 0) {
                throw new BusinessException(502, "Office 預覽轉換失敗");
            }
            if (pdf.length > MAX_PDF_BYTES) throw new BusinessException(413, "Office 預覽文件過大");
            return pdf;
        } catch (BusinessException e) {
            throw e;
        } catch (RestClientException e) {
            log.warn("Office 預覽轉換服務不可用: {}", e.getClass().getSimpleName());
            throw new BusinessException(502, "Office 預覽轉換服務不可用");
        }
    }
}
