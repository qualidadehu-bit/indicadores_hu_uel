const COVER_IMAGE_SRC = '/images/hu-cover.png';
const LOGO_IMAGE_SRC = '/images/assinatura.png';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function readImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function loadPdfImage(src) {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const dataUrl = await blobToDataUrl(await response.blob());
    const dimensions = await readImageDimensions(dataUrl);
    return { dataUrl, ...dimensions };
  } catch {
    return null;
  }
}

export async function loadPdfCoverAssets() {
  const [cover, logo] = await Promise.all([
    loadPdfImage(COVER_IMAGE_SRC),
    loadPdfImage(LOGO_IMAGE_SRC),
  ]);
  return { cover, logo };
}

function addImageContain(doc, image, x, y, maxW, maxH) {
  if (!image) return;
  const ratio = image.width / image.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  doc.addImage(image.dataUrl, 'PNG', x + (maxW - w) / 2, y + (maxH - h) / 2, w, h);
}

function addImageCover(doc, image, x, y, maxW, maxH) {
  if (!image) return;
  const ratio = image.width / image.height;
  let w = maxW;
  let h = w / ratio;
  if (h < maxH) {
    h = maxH;
    w = h * ratio;
  }
  doc.addImage(image.dataUrl, 'PNG', x + (maxW - w) / 2, y + (maxH - h) / 2, w, h);
}

function withOpacity(doc, opacity, draw) {
  if (!doc.GState || !doc.setGState) {
    if (opacity >= 0.5) draw();
    return;
  }
  try {
    doc.setGState(new doc.GState({ opacity }));
    draw();
    doc.setGState(new doc.GState({ opacity: 1 }));
  } catch {
    doc.setGState(new doc.GState({ opacity: 1 }));
  }
}

function drawCoverIcon(doc) {
  doc.setFillColor(255, 255, 255);
  withOpacity(doc, 0.18, () => doc.roundedRect(20, 136, 12, 12, 2, 2, 'F'));
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.roundedRect(23.3, 139.3, 5.4, 5.5, 0.8, 0.8, 'S');
  doc.line(24.6, 138.4, 27.4, 138.4);
  doc.line(25.2, 140.9, 26.9, 140.9);
  doc.line(25.2, 142.4, 27.8, 142.4);
  doc.line(25.2, 143.9, 27.2, 143.9);
}

export function drawPdfCover(doc, { title, subtitle, details, generatedAt, theme, assets }) {
  if (assets?.cover) {
    addImageCover(doc, assets.cover, 0, 0, 210, 297);
  } else {
    doc.setFillColor(...theme.primary);
    doc.rect(0, 0, 210, 297, 'F');
  }

  doc.setFillColor(0, 0, 0);
  withOpacity(doc, 0.22, () => doc.rect(0, 0, 210, 297, 'F'));
  withOpacity(doc, 0.44, () => doc.rect(0, 118, 210, 179, 'F'));

  // Logo qualidade — canto superior direito, caixa um pouco mais alta + fundo branco leve
  const logoPad = 3;
  const logoX = 118;
  const logoY = -2;
  const logoMaxW = 84;
  const logoMaxH = 62;
  if (assets?.logo) {
    const bgX = logoX - logoPad;
    const bgY = logoY - logoPad;
    const bgW = logoMaxW + logoPad * 2;
    const bgH = logoMaxH + logoPad * 2;
    doc.setFillColor(255, 255, 255);
    withOpacity(doc, 0.9, () => doc.roundedRect(bgX, bgY, bgW, bgH, 2.5, 2.5, 'F'));
    addImageContain(doc, assets.logo, logoX, logoY, logoMaxW, logoMaxH);
  }

  drawCoverIcon(doc);

  doc.setFontSize(31);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...theme.primaryText);
  doc.text(doc.splitTextToSize(title, 160), 20, 162);

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...theme.secondaryText);
  doc.text(doc.splitTextToSize(subtitle, 140), 20, 174);

  if (details) {
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(255, 255, 255);
    withOpacity(doc, 0.84, () => doc.text(doc.splitTextToSize(details, 135), 20, 187));
  }

  doc.setDrawColor(255, 255, 255);
  withOpacity(doc, 0.22, () => doc.line(20, 222, 122, 222));
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  withOpacity(doc, 0.62, () => doc.text('INSTITUIÇÃO', 20, 235));
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...theme.primaryText);
  doc.text('Hospital Universitário da', 20, 244);
  doc.text('Universidade de Londrina', 20, 250);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...theme.mutedText);
  doc.text(generatedAt, 20, 280);
}
