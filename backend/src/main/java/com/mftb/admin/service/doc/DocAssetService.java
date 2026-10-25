package com.mftb.admin.service.doc;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.DocKnowledgeDTO.Asset;
import com.mftb.admin.dto.DocNativeDTO.Head;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;

/**
 * 文件资产：流式落盘、内容哈希、magic bytes 校验、下载鉴权。
 *
 * <p>按当前产品口径只做文件直接存储与在线查看，不接入病毒扫描/PDF 文本提取：
 * 扫描结果标记 UNSCANNED，PDF 检索只覆盖标题/摘要/标签，不允许宣称已扫描。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocAssetService {
    private final DocNativeStore store;
    private final DocNativeAccess access;
    private final DocObjectStorage storage;
    private final DocOfficeConverter officeConverter;

    @Value("${doc.storage.max-bytes:52428800}")
    private long maxBytes;
    @Value("${doc.storage.space-quota-bytes:2147483648}")
    private long spaceQuotaBytes;

    @Transactional
    public Asset upload(long spaceId, String fileName, String contentType, long contentLength, InputStream input) {
        access.editSpaceCompat(spaceId);
        if (!access.hasAccessRow(spaceId)) {
            throw new BusinessException(400, "歷史空間只讀，請先在治理頁建立原生空間再上傳");
        }
        if (contentLength <= 0) throw new BusinessException(411, "上傳必須提供 Content-Length");
        if (contentLength > maxBytes) throw new BusinessException(413, "文件不能超過 " + (maxBytes / 1024 / 1024) + " MB");

        String originalName = DocAssetValidator.safeName(fileName);
        String extension = DocAssetValidator.extension(originalName, contentType);
        if (!DocAssetValidator.ALLOWED.contains(extension)) throw new BusinessException(400, "不支援的文件類型");
        String mime = DocAssetValidator.mimeOf(extension);
        long used = store.count("SELECT COALESCE(SUM(size_bytes),0) FROM doc_asset WHERE space_id=? AND status IN (1,2)", spaceId);
        if (used + contentLength > spaceQuotaBytes) throw new BusinessException(413, "空間存儲配額不足");

        Path temp = storage.newTempFile();
        String sha;
        byte[] first = new byte[16];
        int firstLen = 0;
        long total = 0;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (OutputStream out = Files.newOutputStream(temp)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > maxBytes) throw new BusinessException(413, "文件不能超過 " + (maxBytes / 1024 / 1024) + " MB");
                    if (firstLen < first.length) {
                        int copied = Math.min(read, first.length - firstLen);
                        System.arraycopy(buffer, 0, first, firstLen, copied);
                        firstLen += copied;
                    }
                    digest.update(buffer, 0, read);
                    out.write(buffer, 0, read);
                }
            }
            if (total != contentLength) throw new BusinessException(400, "上傳長度與 Content-Length 不一致");
            String magicError = DocAssetValidator.validateMagic(extension, first, firstLen);
            if (magicError != null) throw new BusinessException(400, magicError);
            sha = HexFormat.of().formatHex(digest.digest());
        } catch (BusinessException e) {
            deleteQuietly(temp);
            throw e;
        } catch (Exception e) {
            deleteQuietly(temp);
            throw new IllegalStateException("文件讀取失敗", e);
        }

        Asset existing = findReusable(spaceId, sha, total, access.actor());
        if (existing != null) {
            deleteQuietly(temp);
            return existing;
        }

        String objectKey = "space/" + spaceId + "/" + sha + "." + extension;
        try {
            storage.put(objectKey, temp);
        } catch (RuntimeException e) {
            deleteQuietly(temp);
            throw e;
        }
        long actor = access.actor();
        long id = store.insert("INSERT INTO doc_asset(space_id,sha256,storage_provider,bucket,object_key,original_name,mime,size_bytes,status,scan_result,created_by) "
                        + "VALUES(?,?,?,?,?,?,?,?,2,'UNSCANNED',?)",
                spaceId, sha, storage.provider(), "", objectKey, originalName, mime, total, actor);
        store.audit(null, spaceId, actor, "ASSET_UPLOAD", null, "asset=" + id + ",size=" + total + ",mime=" + mime, null);
        return new Asset(id, spaceId, originalName, mime, total, 2, "UNSCANNED", actor, null);
    }

    @Transactional
    public ResponseEntity<InputStreamResource> download(long assetId, Long nodeId, boolean inline) {
        access.human();
        Asset asset = requireAsset(assetId);
        List<Long> nodes = linkedNodes(assetId);
        if (nodes.isEmpty()) {
            if (store.count("SELECT COUNT(*) FROM doc_asset WHERE id=? AND created_by=?", assetId, access.actor()) == 0) {
                DocNativeAccess.deny();
            }
        } else if (nodeId != null) {
            if (!nodes.contains(nodeId)) DocNativeAccess.deny();
            Head head = store.head(nodeId, false);
            if (inline) access.readDocumentCompat(head);
            else access.downloadDocumentCompat(head);
        } else {
            for (Long linked : nodes) {
                Head head = store.head(linked, false);
                if (inline) access.readDocumentCompat(head);
                else access.downloadDocumentCompat(head);
            }
            nodeId = nodes.get(0);
        }
        store.audit(nodeId, asset.spaceId(), access.actor(), inline ? "ASSET_PREVIEW" : "ASSET_DOWNLOAD",
                null, "asset=" + assetId, null);
        InputStream stream = storage.open(objectKey(assetId));
        ContentDisposition disposition = (inline ? ContentDisposition.inline() : ContentDisposition.attachment())
                .filename(asset.originalName(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(asset.mime()))
                .contentLength(asset.sizeBytes())
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(new InputStreamResource(stream));
    }

    /** Office 原件转预览 PDF；权限与在线预览一致，下载仍走原件。 */
    public ResponseEntity<byte[]> officePreview(long assetId, Long nodeId) {
        access.human();
        Asset asset = requireAsset(assetId);
        if (!isOffice(asset.mime())) throw new BusinessException(400, "非 Office 文件");
        List<Long> nodes = linkedNodes(assetId);
        if (nodes.isEmpty()) {
            if (store.count("SELECT COUNT(*) FROM doc_asset WHERE id=? AND created_by=?", assetId, access.actor()) == 0) {
                DocNativeAccess.deny();
            }
        } else if (nodeId != null) {
            if (!nodes.contains(nodeId)) DocNativeAccess.deny();
            access.readDocumentCompat(store.head(nodeId, false));
        } else {
            for (Long linked : nodes) access.readDocumentCompat(store.head(linked, false));
            nodeId = nodes.get(0);
        }
        byte[] pdf;
        try (InputStream input = storage.open(objectKey(assetId))) {
            pdf = officeConverter.toPdf(input, asset.originalName());
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(500, "Office 文件讀取失敗");
        }
        store.audit(nodeId, asset.spaceId(), access.actor(), "ASSET_OFFICE_PREVIEW", null,
                "asset=" + assetId, null);
        String base = asset.originalName().replaceAll("\\.[^.]+$", "");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(base + ".pdf", StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(pdf.length)
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(pdf);
    }

    private static boolean isOffice(String mime) {
        return mime != null && (mime.contains("word") || mime.contains("excel")
                || mime.contains("powerpoint") || mime.contains("msword") || mime.contains("ms-excel")
                || mime.contains("ms-powerpoint"));
    }

    public Asset view(long assetId) {
        access.human();
        Asset asset = requireAsset(assetId);
        List<Long> nodes = linkedNodes(assetId);
        if (nodes.isEmpty()) {
            if (store.count("SELECT COUNT(*) FROM doc_asset WHERE id=? AND created_by=?", assetId, access.actor()) == 0) {
                DocNativeAccess.deny();
            }
        } else {
            boolean readable = false;
            for (Long nodeId : nodes) {
                Head head = store.head(nodeId, false);
                if (access.canReadDocumentCompat(head, access.actor())) {
                    readable = true;
                    break;
                }
            }
            if (!readable) DocNativeAccess.deny();
        }
        return asset;
    }

    public Asset requireAsset(long assetId) {
        List<Asset> rows = store.jdbc().query(
                "SELECT id,space_id,original_name,mime,size_bytes,status,scan_result,created_by,created_at FROM doc_asset WHERE id=? AND status=2",
                (rs, index) -> new Asset(rs.getLong("id"), rs.getLong("space_id"), rs.getString("original_name"),
                        rs.getString("mime"), rs.getLong("size_bytes"), rs.getInt("status"),
                        rs.getString("scan_result"), rs.getLong("created_by"), rs.getTimestamp("created_at").toLocalDateTime()),
                assetId);
        if (rows.isEmpty()) throw new BusinessException(404, "文件不存在或不可存取");
        return rows.get(0);
    }

    public List<Long> linkedNodes(long assetId) {
        return store.jdbc().queryForList("SELECT DISTINCT r.node_id FROM doc_revision_asset ra "
                + "JOIN doc_revision r ON r.id=ra.revision_id WHERE ra.asset_id=? ORDER BY r.node_id", Long.class, assetId);
    }

    private Asset findReusable(long spaceId, String sha, long size, long actor) {
        List<Asset> rows = store.jdbc().query(
                "SELECT a.id,a.space_id,a.original_name,a.mime,a.size_bytes,a.status,a.scan_result,a.created_by,a.created_at FROM doc_asset a "
                        + "WHERE a.space_id=? AND a.sha256=? AND a.size_bytes=? AND a.status=2 AND a.created_by=? "
                        + "AND NOT EXISTS(SELECT 1 FROM doc_revision_asset ra WHERE ra.asset_id=a.id) ORDER BY a.id LIMIT 1",
                (rs, index) -> new Asset(rs.getLong("id"), rs.getLong("space_id"), rs.getString("original_name"),
                        rs.getString("mime"), rs.getLong("size_bytes"), rs.getInt("status"),
                        rs.getString("scan_result"), rs.getLong("created_by"), rs.getTimestamp("created_at").toLocalDateTime()),
                spaceId, sha, size, actor);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String objectKey(long assetId) {
        List<String> rows = store.jdbc().queryForList("SELECT object_key FROM doc_asset WHERE id=?", String.class, assetId);
        if (rows.isEmpty()) throw new BusinessException(404, "文件不存在或不可存取");
        return rows.get(0);
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (Exception e) {
            log.warn("清理上传临时文件失败: {}", path);
        }
    }
}
