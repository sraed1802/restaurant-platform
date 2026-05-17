// Generate PWA icons using canvas
const generateIcon = (size) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#faf8f4';
  ctx.fillRect(0, 0, size, size);
  
  // Restaurant icon
  ctx.fillStyle = '#b8975a';
  ctx.font = `bold ${size/3}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🍽️', size/2, size/2);
  
  // Download
  const link = document.createElement('a');
  link.download = `icon-${size}x${size}.png`;
  link.href = canvas.toDataURL();
  link.click();
};

// Generate all required sizes
[72, 96, 128, 144, 152, 192, 384, 512].forEach(generateIcon);
