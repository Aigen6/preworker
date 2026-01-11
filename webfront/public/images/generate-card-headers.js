// 生成卡片头部背景图的脚本
// 使用 Canvas API 创建带渐变背景的卡片头部图片

const fs = require('fs');
const { createCanvas } = require('canvas');

// 卡片头部尺寸：宽度 400px，高度 96px (对应 h-24)
const width = 400;
const height = 96;

// 定义每个协议的渐变颜色
const gradients = {
  aave: {
    colors: ['#B6509E', '#2EBAC6'], // 紫色到青色
    name: 'Aave'
  },
  compound: {
    colors: ['#00D395', '#00A8FF'], // 绿色到蓝色
    name: 'Compound'
  },
  makerdao: {
    colors: ['#F4B731', '#1AAB9B'], // 黄色到青色
    name: 'MakerDAO'
  },
  rwa: {
    colors: ['#6366F1', '#8B5CF6'], // 靛蓝到紫色
    name: 'RWA'
  }
};

function createCardHeader(id, gradient) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 创建渐变
  const gradientObj = ctx.createLinearGradient(0, 0, width, height);
  gradientObj.addColorStop(0, gradient.colors[0]);
  gradientObj.addColorStop(1, gradient.colors[1]);

  // 填充背景
  ctx.fillStyle = gradientObj;
  ctx.fillRect(0, 0, width, height);

  // 添加一些装饰性的圆形元素（可选）
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(width * 0.8, height * 0.3, 40, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(width * 0.9, height * 0.7, 30, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.globalAlpha = 1.0;

  // 保存为 PNG
  const buffer = canvas.toBuffer('image/png');
  const filename = id === 'aave' ? 'home-aave.png' : 
                   id === 'compound' ? 'difi-loan.png' : 
                   id === 'rwa' ? 'real-assets.png' : 
                   `${id}-header.png`;
  
  fs.writeFileSync(filename, buffer);
  console.log(`✅ 已生成: ${filename} (${width}x${height})`);
}

// 生成所有卡片头部
Object.keys(gradients).forEach(id => {
  try {
    createCardHeader(id, gradients[id]);
  } catch (error) {
    console.error(`❌ 生成 ${id} 失败:`, error.message);
  }
});

console.log('\n🎨 所有卡片头部图片已生成完成！');









