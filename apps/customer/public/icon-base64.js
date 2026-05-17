// Base64 encoded PNG icon generator
const generateIcon = (size) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#faf8f4';
  ctx.fillRect(0, 0, size, size);
  
  // Circle background
  ctx.fillStyle = '#b8975a';
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0;
  
  // Restaurant icon
  ctx.font = `${size/3}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🍽️', size/2, size/2);
  
  // RMS text
  ctx.fillStyle = '#0e0e0e';
  ctx.font = `bold ${size/12}px Arial`;
  ctx.fillText('RMS', size/2, size * 0.85);
  
  // Convert to base64 and download
  const base64 = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `icon-${size}x${size}.png`;
  link.href = base64;
  link.click();
};

// Generate all required sizes
[72, 96, 128, 144, 152, 192, 384, 512].forEach(generateIcon);

console.log('PWA icons generated! Check your downloads folder.');
