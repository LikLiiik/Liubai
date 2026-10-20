"""Verify a release APK, including v2 content signature and continuity with a previous APK."""
import argparse
import hashlib
import json
import struct
import zipfile
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding


def lp(data, offset=0):
    size = struct.unpack_from('<I', data, offset)[0]
    end = offset + 4 + size
    assert end <= len(data), 'Invalid length prefix'
    return data[offset + 4:end], end


def records(data):
    offset = 0
    while offset < len(data):
        record, offset = lp(data, offset)
        yield record
    assert offset == len(data)


def verify_signature(apk):
    end = apk.rfind(b'PK\x05\x06', max(0, len(apk) - 65557))
    assert end >= 0 and end + 22 + struct.unpack_from('<H', apk, end + 20)[0] == len(apk)
    central = struct.unpack_from('<I', apk, end + 16)[0]
    assert apk[central - 16:central] == b'APK Sig Block 42'
    size = struct.unpack_from('<Q', apk, central - 24)[0]
    start = central - size - 8
    assert start >= 0 and struct.unpack_from('<Q', apk, start)[0] == size
    entries = {}
    offset = start + 8
    while offset < central - 24:
        length, kind = struct.unpack_from('<QI', apk, offset)
        assert length >= 4 and offset + 8 + length <= central - 24
        entries[kind] = apk[offset + 12:offset + 8 + length]
        offset += 8 + length
    assert offset == central - 24 and 0x7109871A in entries, 'APK v2 signature missing'
    signers, consumed = lp(entries[0x7109871A])
    assert consumed == len(entries[0x7109871A])
    certificates = []
    for signer in records(signers):
        signed, cursor = lp(signer)
        signatures, cursor = lp(signer, cursor)
        public, cursor = lp(signer, cursor)
        assert cursor == len(signer)
        digests, cursor = lp(signed)
        certs, cursor = lp(signed, cursor)
        certificate = x509.load_der_x509_certificate(next(records(certs)))
        key = certificate.public_key()
        assert key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo) == public
        verified = False
        for signature in records(signatures):
            algorithm = struct.unpack_from('<I', signature)[0]
            if algorithm not in (0x0101, 0x0102, 0x0103, 0x0104, 0x0201, 0x0202):
                continue
            signature_bytes, _ = lp(signature, 4)
            hash_type = hashes.SHA512 if algorithm in (0x0102, 0x0104, 0x0202) else hashes.SHA256
            if algorithm in (0x0201, 0x0202):
                key.verify(signature_bytes, signed, ec.ECDSA(hash_type()))
            else:
                pad = padding.PSS(mgf=padding.MGF1(hash_type()), salt_length=hash_type.digest_size) if algorithm in (0x0101, 0x0102) else padding.PKCS1v15()
                key.verify(signature_bytes, signed, pad, hash_type())
            digest_record = next(record for record in records(digests) if struct.unpack_from('<I', record)[0] == algorithm)
            expected, _ = lp(digest_record, 4)
            trailer = bytearray(apk[end:])
            struct.pack_into('<I', trailer, 16, start)
            chunks = []
            for section in (apk[:start], apk[central:end], trailer):
                for position in range(0, len(section), 1024 * 1024):
                    chunk = section[position:position + 1024 * 1024]
                    chunks.append(hashlib.new(hash_type.name, b'\xa5' + struct.pack('<I', len(chunk)) + chunk).digest())
            actual = hashlib.new(hash_type.name, b'\x5a' + struct.pack('<I', len(chunks)) + b''.join(chunks)).digest()
            assert actual == expected, 'APK content digest does not match signature'
            verified = True
        assert verified, 'No supported valid signature'
        certificates.append(certificate.fingerprint(hashes.SHA256()).hex())
    assert certificates, 'Empty signer list'
    return sorted(certificates)


def manifest_attributes(data):
    strings = []
    position = 8
    while position < len(data):
        kind, header, size = struct.unpack_from('<HHI', data, position)
        assert size >= header and position + size <= len(data)
        if kind == 1:
            count, _, flags, pool, _ = struct.unpack_from('<IIIII', data, position + 8)
            def length(offset, utf8):
                value = data[offset] if utf8 else struct.unpack_from('<H', data, offset)[0]
                offset += 1 if utf8 else 2
                mask = 0x80 if utf8 else 0x8000
                if value & mask:
                    extra = data[offset] if utf8 else struct.unpack_from('<H', data, offset)[0]
                    value = ((value & (mask - 1)) << (8 if utf8 else 16)) | extra
                    offset += 1 if utf8 else 2
                return value, offset
            for index in range(count):
                offset = position + pool + struct.unpack_from('<I', data, position + header + index * 4)[0]
                if flags & 0x100:
                    _, offset = length(offset, True)
                    count_bytes, offset = length(offset, True)
                    strings.append(data[offset:offset + count_bytes].decode('utf8'))
                else:
                    count_chars, offset = length(offset, False)
                    strings.append(data[offset:offset + count_chars * 2].decode('utf-16le'))
        elif kind == 0x0102:
            _, name, attr_start, attr_size, count = struct.unpack_from('<IIHHH', data, position + 16)
            if strings[name] == 'manifest':
                attrs = {}
                for index in range(count):
                    offset = position + 16 + attr_start + attr_size * index
                    _, key, raw, _, _, value_type, value = struct.unpack_from('<IIIHBBI', data, offset)
                    attrs[strings[key]] = strings[raw] if raw != 0xFFFFFFFF else strings[value] if value_type == 3 else value
                return attrs
        position += size
    raise AssertionError('Manifest root missing')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('apk', type=Path)
    parser.add_argument('--previous', required=True, type=Path)
    parser.add_argument('--version', required=True)
    parser.add_argument('--code', required=True, type=int)
    args = parser.parse_args()
    apk = args.apk.read_bytes()
    with zipfile.ZipFile(args.apk) as archive:
        assert archive.testzip() is None, 'ZIP CRC failed'
        manifest = manifest_attributes(archive.read('AndroidManifest.xml'))
        assert manifest['package'] == 'app.liubai.planner'
        assert manifest['versionName'] == args.version
        assert manifest['versionCode'] == args.code
        bundle = archive.read('assets/index.android.bundle')
        assert bundle[:8] == bytes.fromhex('c61fbc03c103191f'), 'Hermes bundle missing'
        assert b'queryxszykbzong' in bundle, 'School reader missing'
        assert any(b'RNCWebView' in archive.read(name) for name in archive.namelist() if name.endswith('.dex')), 'Native WebView missing'
        assert any(name.startswith('lib/arm64-v8a/') and name.endswith('.so') for name in archive.namelist())
        assert any(b'jw.hitsz.edu.cn' in archive.read(name) or 'jw.hitsz.edu.cn'.encode('utf-16le') in archive.read(name)
                   for name in archive.namelist() if name.startswith('res/') and name.endswith('.xml')), 'School network resource missing'
    certificates = verify_signature(apk)
    assert certificates == verify_signature(args.previous.read_bytes()), 'Signing certificate changed'
    print(json.dumps({'version': args.version, 'androidVersionCode': args.code, 'package': manifest['package'],
                      'sizeBytes': len(apk), 'sha256': hashlib.sha256(apk).hexdigest(), 'signingCertificateSha256': certificates,
                      'checks': {name: 'passed' for name in ['archiveCrc', 'package', 'embeddedBundle', 'arm64Libraries', 'schoolReaderBundle', 'schoolNetworkResource', 'nativeWebView', 'signature', 'signingContinuity']}}, indent=2))


if __name__ == '__main__':
    main()
