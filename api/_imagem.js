// api/_imagem.js
//
// Dimensões de PNG/JPEG lendo só o cabeçalho (sem dependência). Usado para
// dimensionar o logo do escritório no timbrado da peça.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

/** @returns {{ extension: '.png'|'.jpg', width: number, height: number } | null} */
export function dimensoesImagem(buf) {
  if (!buf || buf.length < 24) return null;

  // PNG: assinatura de 8 bytes + chunk IHDR (largura/altura em big-endian nos bytes 16-23)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return width > 0 && height > 0 ? { extension: '.png', width, height } : null;
  }

  // JPEG: percorre os marcadores até um SOFn (0xC0-0xCF, exceto DHT/JPG/DAC)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marcador = buf[i + 1];
      if (marcador === 0xff) {
        i++;
        continue;
      }
      if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return width > 0 && height > 0 ? { extension: '.jpg', width, height } : null;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * Tamanho do logo no cabeçalho, em cm: altura-alvo de 2 cm, largura limitada a
 * 6 cm (logos horizontais compridos encolhem proporcionalmente).
 */
export function tamanhoLogoCm({ width, height }, alturaCm = 2, larguraMaxCm = 6) {
  let h = alturaCm;
  let w = (width / height) * h;
  if (w > larguraMaxCm) {
    w = larguraMaxCm;
    h = (height / width) * w;
  }
  return { widthCm: Math.round(w * 100) / 100, heightCm: Math.round(h * 100) / 100 };
}
