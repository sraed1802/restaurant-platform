// Create PWA icons using Canvas API
const fs = require('fs');
const { createCanvas } = require('canvas');

function drawIcon(size) {
  const canvas = createCanvas(size, size);
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
  
  return canvas;
}

// Generate all required sizes
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

sizes.forEach(size => {
  const canvas = drawIcon(size);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`icon-${size}x${size}.png`, buffer);
  console.log(`Generated icon-${size}x${size}.png`);
});

console.log('All PWA icons generated successfully!');
