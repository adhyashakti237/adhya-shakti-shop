import os
import re
import secrets


SAFE_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
SAFE_ATTACHMENT_EXTENSIONS = SAFE_IMAGE_EXTENSIONS | {'.pdf'}

PUBLIC_UPLOAD_MAX_BYTES = 6 * 1024 * 1024
PRIVATE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

PUBLIC_UPLOAD_FILENAME_RE = re.compile(
    r'^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:jpe?g|png|webp)$',
    re.IGNORECASE,
)
PUBLIC_UPLOAD_RE = re.compile(
    r'^/uploads/[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.(?:jpe?g|png|webp)$',
    re.IGNORECASE,
)
STORED_FILE_RE = re.compile(
    r'^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'
    r'\.(?:jpe?g|png|webp|pdf)$',
    re.IGNORECASE,
)


class UploadSecurityError(ValueError):
    pass


def clean_text(value, max_len=500, *, strip=True):
    text = '' if value is None else str(value)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    if strip:
        text = text.strip()
    return text[:max_len]


def _stream_size(stream):
    pos = stream.tell()
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(pos)
    return size


def _read_prefix(stream, n=4096):
    pos = stream.tell()
    stream.seek(0)
    data = stream.read(n)
    stream.seek(pos)
    return data or b''


def _read_suffix(stream, n=8192):
    pos = stream.tell()
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(max(0, size - n))
    data = stream.read(n)
    stream.seek(pos)
    return data or b''


def _read_all_limited(stream, max_bytes):
    pos = stream.tell()
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    if size > max_bytes:
        stream.seek(pos)
        raise UploadSecurityError('File is too large to scan safely')
    stream.seek(0)
    data = stream.read()
    stream.seek(pos)
    return data or b''


def sniff_upload_kind(stream):
    header = _read_prefix(stream, 4096)
    if header[:3] == b'\xff\xd8\xff':
        return 'jpg', 'image/jpeg'
    if header[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png', 'image/png'
    if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        return 'webp', 'image/webp'
    if header.startswith(b'%PDF-'):
        return 'pdf', 'application/pdf'
    return None, None


def _looks_like_active_content(stream, kind):
    scan = _read_all_limited(stream, PRIVATE_ATTACHMENT_MAX_BYTES).lower()
    if kind in ('jpg', 'png', 'webp'):
        return any(bad in scan for bad in (
            # NOTE: no raw b'MZ' (exe header) scan here — a 2-byte pattern appears by
            # chance in virtually every multi-megabyte photo, rejecting legit uploads.
            # No b'<svg' scan either: C2PA Content Credentials (embedded by AI image
            # tools) legitimately include the generator's icon as inline SVG, so that
            # pattern flags essentially every AI-generated photo. Embedded SVG text in
            # a valid raster file is inert — the magic-byte sniff pins the type at
            # offset 0, and images are fully re-encoded through Pillow afterwards,
            # which strips all metadata and embedded payloads.
            b'<script', b'<html', b'<?php', b'javascript:', b'<!doctype html'
        ))
    if kind == 'pdf':
        suffix = _read_suffix(stream, 8192)
        if b'%%EOF' not in suffix:
            return True
        return any(bad in scan for bad in (
            b'/javascript', b'/js', b'/openaction', b'/aa', b'/launch', b'/embeddedfile',
            b'/encrypt', b'/xfa', b'/richmedia', b'/submitform', b'/importdata', b'/sound',
            b'/movie', b'/rendition'
        ))
    return True


def validate_upload(file_storage, allowed_exts, max_bytes):
    if not file_storage or not file_storage.filename:
        raise UploadSecurityError('No file selected')

    original = os.path.basename(clean_text(file_storage.filename, 180))
    ext = os.path.splitext(original)[1].lower()
    if ext not in allowed_exts:
        allowed = ', '.join(sorted(e.lstrip('.') for e in allowed_exts))
        raise UploadSecurityError(f'File type not allowed. Allowed: {allowed}')

    stream = file_storage.stream
    size = _stream_size(stream)
    if size <= 0:
        raise UploadSecurityError('The selected file is empty')
    if size > max_bytes:
        mb = max_bytes // (1024 * 1024)
        raise UploadSecurityError(f'File is too large. Maximum size is {mb} MB')

    kind, mime = sniff_upload_kind(stream)
    expected = {'jpg': {'.jpg', '.jpeg'}, 'png': {'.png'}, 'webp': {'.webp'}, 'pdf': {'.pdf'}}
    if not kind or ext not in expected.get(kind, set()):
        raise UploadSecurityError('File content does not match the file extension')

    declared_mime = (getattr(file_storage, 'mimetype', '') or '').split(';', 1)[0].strip().lower()
    allowed_mimes = {
        'jpg': {'image/jpeg', 'image/jpg', 'image/pjpeg'},
        'png': {'image/png', 'image/x-png'},
        'webp': {'image/webp'},
        'pdf': {'application/pdf', 'application/x-pdf'},
    }
    if declared_mime and declared_mime not in {'application/octet-stream', 'binary/octet-stream'}:
        if declared_mime not in allowed_mimes.get(kind, set()):
            raise UploadSecurityError('File MIME type does not match the file content')

    if _looks_like_active_content(stream, kind):
        raise UploadSecurityError('This file appears to contain active or unsafe content')

    return {
        'original_name': original,
        'ext': '.jpg' if ext == '.jpeg' else ext,
        'kind': kind,
        'mime': mime,
        'size': size,
    }


def random_stored_name(ext):
    return secrets.token_hex(16) + ext


def is_safe_public_upload_url(url):
    return bool(PUBLIC_UPLOAD_RE.fullmatch(clean_text(url, 260)))


def is_safe_public_upload_filename(filename):
    text = clean_text(filename, 220)
    if not text or text != os.path.basename(text) or '/' in text or '\\' in text:
        return False
    return bool(PUBLIC_UPLOAD_FILENAME_RE.fullmatch(text))


def is_safe_static_image_url(url):
    text = clean_text(url, 260)
    return (
        is_safe_public_upload_url(text)
        or bool(re.fullmatch(r'/images/[A-Za-z0-9._/-]+\.(?:jpe?g|png|webp)', text, re.IGNORECASE))
    )


def is_safe_stored_filename(filename):
    text = clean_text(filename, 120)
    if not text or text != os.path.basename(text) or '/' in text or '\\' in text:
        return False
    return bool(STORED_FILE_RE.fullmatch(text))


def secure_upload_headers(response, *, attachment=False):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
    response.headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox"
    response.headers['Cache-Control'] = 'no-store, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    if attachment:
        response.headers['Content-Disposition'] = response.headers.get('Content-Disposition', 'attachment')
        response.headers['X-Download-Options'] = 'noopen'
    return response
