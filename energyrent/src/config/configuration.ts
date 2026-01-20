export default () => ({
  port: parseInt(process.env.PORT, 10) || 4001,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // CatFee 配置
  catfee: {
    apiKey: process.env.CATFEE_API_KEY,
    apiSecret: process.env.CATFEE_API_SECRET,
    baseUrl: 'https://api.catfee.io',
    enabled: process.env.CATFEE_ENABLED !== 'false',
  },
  
  // GasStation 配置
  gasstation: {
    appId: process.env.GASSTATION_APP_ID,
    secret: process.env.GASSTATION_SECRET,
    baseUrl: 'https://openapi.gasstation.ai',
    enabled: process.env.GASSTATION_ENABLED !== 'false',
  },
  
  // TronFuel 配置
  tronfuel: {
    apiKey: process.env.TRONFUEL_API_KEY,
    apiSecret: process.env.TRONFUEL_API_SECRET,
    baseUrl: 'https://api.tronfuel.dev',
    enabled: process.env.TRONFUEL_ENABLED !== 'false',
  },
  
  // TronXEnergy 配置
  tronxenergy: {
    apiKey: process.env.TRONXENERGY_API_KEY,
    baseUrl: 'https://api.tronxenergy.com',
    enabled: process.env.TRONXENERGY_ENABLED !== 'false',
  },
});
