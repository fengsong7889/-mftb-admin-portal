package com.mftb.admin.service.doc;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

/** 文件上传安全边界：扩展名、文件头、文本伪装与路径片段。 */
class DocAssetValidatorTest {
    @Test void realPdfHeaderIsAccepted() {
        byte[] head = "%PDF-1.7".getBytes(StandardCharsets.US_ASCII);
        assertNull(DocAssetValidator.validateMagic("pdf", head, head.length));
    }

    @Test void htmlRenamedToPdfIsRejected() {
        byte[] head = "<html>".getBytes(StandardCharsets.US_ASCII);
        assertNotNull(DocAssetValidator.validateMagic("pdf", head, head.length));
    }

    @Test void officeZipHeaderIsAccepted() {
        byte[] head = {'P', 'K', 3, 4};
        assertNull(DocAssetValidator.validateMagic("docx", head, head.length));
        assertNull(DocAssetValidator.validateMagic("xlsx", head, head.length));
        assertNull(DocAssetValidator.validateMagic("pptx", head, head.length));
    }

    @Test void officeWithWrongHeaderIsRejected() {
        byte[] head = "MZ".getBytes(StandardCharsets.US_ASCII);
        assertNotNull(DocAssetValidator.validateMagic("docx", head, head.length));
    }

    @Test void textWithNulByteIsRejected() {
        byte[] head = {'a', 0, 'b'};
        assertNotNull(DocAssetValidator.validateMagic("md", head, head.length));
        assertNotNull(DocAssetValidator.validateMagic("txt", head, head.length));
        assertNotNull(DocAssetValidator.validateMagic("csv", head, head.length));
    }

    @Test void plainMarkdownIsAccepted() {
        byte[] head = "# 标题".getBytes(StandardCharsets.UTF_8);
        assertNull(DocAssetValidator.validateMagic("md", head, head.length));
    }

    @Test void pngAndJpegHeadersAreAccepted() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
        byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
        assertNull(DocAssetValidator.validateMagic("png", png, png.length));
        assertNull(DocAssetValidator.validateMagic("jpg", jpeg, jpeg.length));
    }

    @Test void emptyFileIsRejected() {
        assertNotNull(DocAssetValidator.validateMagic("pdf", new byte[0], 0));
    }

    @Test void pathSegmentsAreStripped() {
        assertEquals("report.pdf", DocAssetValidator.safeName("../../etc/report.pdf"));
        assertEquals("report.pdf", DocAssetValidator.safeName("C:\\temp\\report.pdf"));
        assertEquals("unnamed", DocAssetValidator.safeName(null));
    }

    @Test void extensionFallsBackToContentType() {
        assertEquals("pdf", DocAssetValidator.extension("download", "application/pdf"));
        assertEquals("md", DocAssetValidator.extension("download", "text/markdown"));
        assertEquals("pdf", DocAssetValidator.extension("REPORT.PDF", null));
    }

    @Test void clientMimeNeverDecidesStoredMime() {
        assertEquals("application/pdf", DocAssetValidator.mimeOf("pdf"));
        assertEquals("text/markdown; charset=utf-8", DocAssetValidator.mimeOf("md"));
        assertEquals("application/octet-stream", DocAssetValidator.mimeOf("exe"));
        assertFalse(DocAssetValidator.ALLOWED.contains("exe"));
        assertFalse(DocAssetValidator.ALLOWED.contains("html"));
        assertFalse(DocAssetValidator.ALLOWED.contains("svg"));
    }
}
