package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/** Office→PDF 适配器：未配置明确 503；配置后按 Gotenberg 路由提交并返回 PDF。 */
class DocOfficeConverterTest {

    @Test void unconfiguredConverterRejectsInsteadOfFakingPreview() {
        DocOfficeConverter converter = new DocOfficeConverter();
        ReflectionTestUtils.setField(converter, "url", "");
        ReflectionTestUtils.setField(converter, "timeoutMs", 1000);
        converter.init();
        BusinessException error = assertThrows(BusinessException.class,
                () -> converter.toPdf(new ByteArrayInputStream(new byte[]{'P', 'K'}), "a.docx"));
        assertEquals(503, error.getCode());
    }

    @Test void configuredConverterPostsMultipartAndReturnsPdf() throws Exception {
        AtomicReference<String> path = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/forms/libreoffice/convert", exchange -> {
            path.set(exchange.getRequestURI().getPath());
            byte[] body = exchange.getRequestBody().readAllBytes();
            byte[] pdf = ("%PDF-1.4\n%" + body.length).getBytes(StandardCharsets.US_ASCII);
            exchange.getResponseHeaders().add("Content-Type", "application/pdf");
            exchange.sendResponseHeaders(200, pdf.length);
            exchange.getResponseBody().write(pdf);
            exchange.close();
        });
        server.start();
        try {
            DocOfficeConverter converter = new DocOfficeConverter();
            ReflectionTestUtils.setField(converter, "url",
                    "http://127.0.0.1:" + server.getAddress().getPort());
            ReflectionTestUtils.setField(converter, "timeoutMs", 3000);
            converter.init();
            byte[] pdf = converter.toPdf(new ByteArrayInputStream("PK-docx".getBytes(StandardCharsets.UTF_8)),
                    "制度.docx");
            assertTrue(new String(pdf, StandardCharsets.US_ASCII).startsWith("%PDF-1.4"));
            assertEquals("/forms/libreoffice/convert", path.get());
        } finally {
            server.stop(0);
        }
    }
}
