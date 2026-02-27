#!/usr/bin/env python3
"""Generate simple PNG icons for the extension."""
import struct, zlib, os

def create_png(size, color=(99, 102, 241)):
    """Create a simple colored square PNG."""
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)
    
    signature = b'\x89PNG\r\n\x1a\n'
    # IHDR
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    # Create image data - gradient square with symbol
    rows = []
    r, g, b = color
    for y in range(size):
        row = b'\x00'  # filter type
        for x in range(size):
            # Gradient effect
            factor = 1 - 0.3 * (x + y) / (2 * size)
            rr = min(255, int(r * factor + 100 * (1 - factor)))
            gg = min(255, int(g * factor + 130 * (1 - factor)))
            bb = min(255, int(b * factor + 240 * (1 - factor)))
            # Rounded corner effect
            cx, cy = size // 2, size // 2
            corner_r = size * 0.25
            px, py = x - size * 0.15, y - size * 0.15
            if px < corner_r and py < corner_r:
                if (px**2 + py**2) > corner_r**2:
                    rr, gg, bb = 0, 0, 0
            row += bytes([rr, gg, bb])
        rows.append(row)
    
    raw = b''.join(rows)
    compressed = zlib.compress(raw, 9)
    
    return (signature 
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b''))

os.makedirs('assets', exist_ok=True)
for size in [16, 32, 48, 128]:
    png = create_png(size)
    with open(f'assets/icon{size}.png', 'wb') as f:
        f.write(png)
    print(f'Created icon{size}.png')

print('Icons generated!')
