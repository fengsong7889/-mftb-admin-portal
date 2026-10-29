package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesAttachment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingMinutesAttachmentMapper;
import com.mftb.admin.service.doc.DocObjectStorage;
import com.mftb.admin.service.doc.DocOfficeConverter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 纪要附件的存储校验与状态机。
 *
 * <p>钉住的都是"绕过前端直连接口"就能触碰到的边界：伪造扩展名的 HTML、
 * 超 10 MiB、跨会议绑定、拿别人的未绑定附件冒领、幂等键复用、已发布文件被物理删。
 * 这些一旦放进实现细节里靠"前端已经拦过"，就是一次 curl 的事。
 */
class MeetingMinutesAttachmentServiceTest {

    private static final SysUser UPLOADER = user(7L, "李四");

    private MeetingMinutesAttachmentMapper mapper;
    private DocObjectStorage storage;
    private DocOfficeConverter converter;
    private MeetingMinutesAttachmentService service;
    private Path root;

    private static SysUser user(long id, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setName(name);
        return user;
    }

    private static byte[] pdf() {
        return "%PDF-1.4\nhello".getBytes(StandardCharsets.US_ASCII);
    }

    private static byte[] png() {
        return new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3} ;
    }

    private static byte[] docx() {
        return new byte[]{'P', 'K', 0x03, 0x04, 0, 0, 0, 0, 1, 2, 3, 4};
    }

    private static byte[] legacyDoc() {
        return new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1, 5, 6};
    }

    private static byte[] gif() {
        return "GIF89a....".getBytes(StandardCharsets.US_ASCII);
    }

    @BeforeEach
    void setUp() throws IOException {
        mapper = mock(MeetingMinutesAttachmentMapper.class);
        storage = mock(DocObjectStorage.class);
        converter = mock(DocOfficeConverter.class);
        root = Files.createTempDirectory("att-test");
        when(storage.newTempFile()).thenAnswer(call -> Files.createTempFile(root, "upload-", ".part"));
        when(storage.provider()).thenReturn("local");
        service = new MeetingMinutesAttachmentService(mapper, storage, converter);
    }

    private MeetingMinutesAttachment upload(byte[] body, String fileName, String key) {
        return service.upload(100L, fileName, body.length, new ByteArrayInputStream(body), key, UPLOADER);
    }

    /* ==================== 上传校验 ==================== */

    @Test
    @DisplayName("非白名单扩展名直接拒绝：SVG 能带 onload 脚本，绝不能进附件")
    void rejectsNonWhitelistedExtension() {
        assertThrows(BusinessException.class, () -> upload("<svg onload=alert(1)>".getBytes(StandardCharsets.UTF_8), "圖.svg", "k1"));
        assertThrows(BusinessException.class, () -> upload("MZ....".getBytes(), "tool.exe", "k2"));
        verify(mapper, never()).insert(any(MeetingMinutesAttachment.class));
    }

    @Test
    @DisplayName("扩展名对但内容是伪装的：magic bytes 不匹配一律拒绝")
    void rejectsSpoofedMagicBytes() {
        BusinessException htmlAsPng = assertThrows(BusinessException.class,
                () -> upload("<html>fake</html>".getBytes(StandardCharsets.UTF_8), "假圖.png", "k1"));
        assertTrue(htmlAsPng.getMessage().contains("PNG"), htmlAsPng.getMessage());
        assertThrows(BusinessException.class, () -> upload("<html>fake</html>".getBytes(StandardCharsets.UTF_8), "假文檔.doc", "k2"));
        assertThrows(BusinessException.class, () -> upload("not-zip".getBytes(), "假doc.docx", "k3"));
        assertThrows(BusinessException.class, () -> upload("GIF99b".getBytes(), "壞圖.gif", "k4"));
        verify(mapper, never()).insert(any(MeetingMinutesAttachment.class));
    }

    @Test
    @DisplayName("真实文件头全部放行，并按扩展名规范化 MIME 落库")
    void acceptsRealSignatures() {
        when(mapper.insert(any(MeetingMinutesAttachment.class))).thenReturn(1);
        upload(pdf(), "會議資料.pdf", "k1");
        upload(png(), "白板.png", "k2");
        upload(docx(), "說明.docx", "k3");
        upload(legacyDoc(), "舊檔.doc", "k4");
        upload(gif(), "動圖.gif", "k5");
        ArgumentCaptor<MeetingMinutesAttachment> captor = ArgumentCaptor.forClass(MeetingMinutesAttachment.class);
        verify(mapper, org.mockito.Mockito.times(5)).insert(captor.capture());
        assertEquals("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                captor.getAllValues().get(2).getMime());
        assertEquals("image/gif", captor.getAllValues().get(4).getMime());
        assertEquals(MeetingMinutesAttachment.STATUS_UNBOUND, captor.getAllValues().get(0).getStatus());
        assertTrue(captor.getAllValues().get(0).getObjectKey().startsWith("meeting-minutes/attachments/"));
    }

    @Test
    @DisplayName("空文件与 Content-Length 不符的截断流都被拒绝")
    void rejectsEmptyAndLengthMismatch() {
        assertThrows(BusinessException.class, () -> upload(new byte[0], "空.pdf", "k1"));
        byte[] body = pdf();
        assertThrows(BusinessException.class, () -> service.upload(100L, "截斷.pdf", body.length + 10,
                new ByteArrayInputStream(body), "k2", UPLOADER));
        verify(mapper, never()).insert(any(MeetingMinutesAttachment.class));
    }

    @Test
    @DisplayName("幂等键重放：同内容返回已登记行，不同内容拒绝复用同一识别码")
    void idempotentReplayReturnsSameRow() {
        byte[] body = pdf();
        MeetingMinutesAttachment existing = new MeetingMinutesAttachment();
        existing.setAttachmentNo("e".repeat(32));
        existing.setBookingId(100L);
        existing.setStatus(MeetingMinutesAttachment.STATUS_UNBOUND);
        existing.setRequestHash(MeetingMinutesAttachmentService.hashOf(shaOf(body), "會議資料.pdf", body.length));
        when(mapper.findByRequest(100L, "k1")).thenReturn(existing);
        MeetingMinutesAttachment replay = upload(body, "會議資料.pdf", "k1");
        assertEquals("e".repeat(32), replay.getAttachmentNo());
        verify(mapper, never()).insert(any(MeetingMinutesAttachment.class));

        when(mapper.findByRequest(100L, "k2")).thenReturn(existing);
        assertThrows(BusinessException.class, () -> upload(png(), "另一張.png", "k2"));
    }

    private static String shaOf(byte[] body) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(body));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /* ==================== 绑定状态机 ==================== */

    private static MeetingMinutes minutes() {
        MeetingMinutes minutes = new MeetingMinutes();
        minutes.setId(9L);
        minutes.setBookingId(100L);
        return minutes;
    }

    private static MeetingMinutesAttachment row(String no, int status, Long minutesId, long uploader) {
        MeetingMinutesAttachment row = new MeetingMinutesAttachment();
        row.setAttachmentNo(no);
        row.setBookingId(100L);
        row.setMinutesId(minutesId);
        row.setUploadUserId(uploader);
        row.setStatus(status);
        row.setOriginalName(no + ".pdf");
        row.setMime("application/pdf");
        row.setSizeBytes(1024L);
        return row;
    }

    private static MeetingMinutesContent contentWithAttachments(List<String> nos) {
        MeetingMinutesContent content = new MeetingMinutesContent();
        MeetingMinutesContent.Item item = new MeetingMinutesContent.Item();
        item.setTopic("口徑");
        content.setItems(List.of(item));
        content.setActions(List.of());
        content.setAttachments(nos);
        return content;
    }

    @Test
    @DisplayName("旧客户端不带附件字段：保留既有绑定，不被静默清空")
    void nullRequestedKeepsPreviousBindings() {
        MeetingMinutesContent content = contentWithAttachments(null);
        List<String> kept = service.applyBindings(minutes(), 100L, content, List.of("a".repeat(32)), UPLOADER);
        assertEquals(List.of("a".repeat(32)), kept);
        assertEquals(List.of("a".repeat(32)), content.getAttachments());
        verify(mapper, never()).bind(anyString(), anyLong(), anyLong(), anyLong(), anyString());
        verify(mapper, never()).unbind(anyString(), anyLong(), anyString());
    }

    @Test
    @DisplayName("绑定只认「本人上传且未绑定」的行：冒领他人附件、跨会议绑定一律拒绝")
    void bindRejectsForeignRows() {
        String mine = "a".repeat(32);
        String others = "b".repeat(32);
        MeetingMinutesAttachment mineRow = row(mine, MeetingMinutesAttachment.STATUS_UNBOUND, null, 7L);
        MeetingMinutesAttachment othersRow = row(others, MeetingMinutesAttachment.STATUS_UNBOUND, null, 8L);
        when(mapper.findByNos(any())).thenReturn(List.of(mineRow, othersRow));
        when(mapper.bind(eq(mine), eq(9L), eq(100L), eq(7L), anyString())).thenReturn(1);
        BusinessException error = assertThrows(BusinessException.class, () ->
                service.applyBindings(minutes(), 100L, contentWithAttachments(List.of(mine, others)), List.of(), UPLOADER));
        assertTrue(error.getMessage().contains("本人"), error.getMessage());
    }

    @Test
    @DisplayName("跨会议的附件号即使存在也不能绑进本场会：统一按不存在处理，不泄露存在性")
    void bindRejectsOtherBookingRows() {
        String foreign = "c".repeat(32);
        MeetingMinutesAttachment foreignRow = row(foreign, MeetingMinutesAttachment.STATUS_UNBOUND, null, 7L);
        foreignRow.setBookingId(200L);
        when(mapper.findByNos(any())).thenReturn(List.of(foreignRow));
        BusinessException error = assertThrows(BusinessException.class, () ->
                service.applyBindings(minutes(), 100L, contentWithAttachments(List.of(foreign)), List.of(), UPLOADER));
        assertTrue(error.getMessage().contains("不存在"), error.getMessage());
    }

    @Test
    @DisplayName("绑定成功走条件更新；正文移除的旧附件回退为未绑定")
    void bindsAndUnbindsInOrder() {
        String keep = "a".repeat(32);
        String drop = "b".repeat(32);
        String fresh = "c".repeat(32);
        MeetingMinutesContent content = contentWithAttachments(List.of(keep, fresh));
        when(mapper.findByNos(any())).thenReturn(List.of(
                row(keep, MeetingMinutesAttachment.STATUS_BOUND, 9L, 7L),
                row(fresh, MeetingMinutesAttachment.STATUS_UNBOUND, null, 7L),
                row(drop, MeetingMinutesAttachment.STATUS_BOUND, 9L, 7L)));
        when(mapper.bind(eq(fresh), eq(9L), eq(100L), eq(7L), anyString())).thenReturn(1);
        when(mapper.unbind(eq(drop), eq(9L), anyString())).thenReturn(1);
        List<String> kept = service.applyBindings(minutes(), 100L, content, List.of(keep, drop), UPLOADER);
        assertEquals(List.of(keep, fresh), kept);
        verify(mapper).bind(fresh, 9L, 100L, 7L, "李四");
        verify(mapper).unbind(drop, 9L, "李四");
    }

    @Test
    @DisplayName("不存在的附件号不能写进正文：伪造号一律按不存在拒绝")
    void unknownNumberRejected() {
        MeetingMinutesContent content = contentWithAttachments(List.of("d".repeat(32)));
        when(mapper.findByNos(any())).thenReturn(List.of());
        assertThrows(BusinessException.class,
                () -> service.applyBindings(minutes(), 100L, content, List.of(), UPLOADER));
    }

    @Test
    @DisplayName("发布定格只对绑定在本纪要上的行生效，历史快照永不缺文件")
    void markPublishedCoversEveryReferencedRow() {
        String no = "a".repeat(32);
        when(mapper.markPublished(no, 9L, "王五")).thenReturn(1);
        service.markPublished(minutes(), contentWithAttachments(List.of(no)), user(5L, "王五"));
        verify(mapper).markPublished(no, 9L, "王五");
    }

    /* ==================== 删除与回收 ==================== */

    @Test
    @DisplayName("删除只认「本人 + 未绑定」：条件更新 0 行时给权限口径而不是假装成功")
    void deleteOnlyOwnsUnbound() {
        String no = "a".repeat(32);
        when(mapper.findByNo(no)).thenReturn(row(no, MeetingMinutesAttachment.STATUS_UNBOUND, null, 7L));
        when(mapper.deleteUnbound(no, 7L)).thenReturn(0);
        assertThrows(BusinessException.class, () -> service.deleteUnbound(no, UPLOADER));
        verify(storage, never()).delete(anyString());
    }

    @Test
    @DisplayName("删除成功后同步移除对象存储里的文件")
    void deleteRemovesObject() {
        String no = "a".repeat(32);
        MeetingMinutesAttachment target = row(no, MeetingMinutesAttachment.STATUS_UNBOUND, null, 7L);
        target.setObjectKey("meeting-minutes/attachments/2026-10/" + no + ".pdf");
        when(mapper.findByNo(no)).thenReturn(target);
        when(mapper.deleteUnbound(no, 7L)).thenReturn(1);
        service.deleteUnbound(no, UPLOADER);
        verify(storage).delete(target.getObjectKey());
    }

    @Test
    @DisplayName("过期回收：候选行逐条条件删除，删到行才删对象；对象失败不挡行回收")
    void cleanupRemovesStaleRowsAndObjects() {
        MeetingMinutesAttachment stale = row("a".repeat(32), MeetingMinutesAttachment.STATUS_UNBOUND, null, 7L);
        stale.setObjectKey("k1");
        when(mapper.findStaleUnbound(any(LocalDateTime.class))).thenReturn(List.of(stale));
        when(mapper.deleteUnbound(stale.getAttachmentNo(), 7L)).thenReturn(1);
        org.mockito.Mockito.doThrow(new IllegalStateException("disk")).when(storage).delete("k1");
        assertEquals(1, service.cleanupStaleUnbound());
        verify(storage).delete("k1");
    }

    /* ==================== 文件响应 ==================== */

    @Test
    @DisplayName("下载给原件 + attachment 处置；PDF 查看给内联；响应带全套防嗅探头")
    void fileResponsesAreHardened() {
        MeetingMinutesAttachment target = row("a".repeat(32), MeetingMinutesAttachment.STATUS_PUBLISHED, 9L, 7L);
        target.setObjectKey("k1");
        when(storage.open("k1")).thenReturn(new ByteArrayInputStream(pdf()));
        var download = service.file(target, "download");
        assertEquals("attachment", download.getHeaders().getContentDisposition().getType());
        var view = service.file(target, "view");
        assertEquals("inline", view.getHeaders().getContentDisposition().getType());
        assertEquals("application/pdf", String.valueOf(view.getHeaders().getContentType()));
        assertEquals("nosniff", view.getHeaders().getFirst("X-Content-Type-Options"));
        assertEquals("no-referrer", view.getHeaders().getFirst("Referrer-Policy"));
        assertEquals("default-src 'none'", view.getHeaders().getFirst("Content-Security-Policy"));
        assertTrue(view.getHeaders().getCacheControl().contains("no-store"));
    }

    @Test
    @DisplayName("Word 查看走服务端转 PDF；转换失败明确报错并保留下载路径")
    void officeViewConvertsToPdf() {
        MeetingMinutesAttachment target = row("a".repeat(32), MeetingMinutesAttachment.STATUS_BOUND, 9L, 7L);
        target.setOriginalName("說明.docx");
        target.setMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        target.setObjectKey("k1");
        when(storage.open("k1")).thenReturn(new ByteArrayInputStream(docx()));
        when(converter.toPdf(any(), eq("說明.docx"))).thenReturn(pdf());
        var response = service.file(target, "view");
        assertEquals("application/pdf", String.valueOf(response.getHeaders().getContentType()));
        assertNotNull(response.getBody());
        when(converter.toPdf(any(), anyString())).thenThrow(new BusinessException(502, "轉換服務不可用"));
        assertThrows(BusinessException.class, () -> service.file(target, "view"));
    }
}
