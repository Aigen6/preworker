const { ethers } = require('ethers');

// WithdrawPublicValues struct definition (matching ZKPay.sol)
const WithdrawPublicValuesABI = [
  {
    components: [
      { name: 'commitmentRoot', type: 'bytes32' },
      { name: 'nullifiers', type: 'bytes32[]' },
      { name: 'amount', type: 'uint256' },
      { name: 'intentType', type: 'uint8' },
      { name: 'slip44chainID', type: 'uint32' },
      { name: 'adapterId', type: 'uint32' },
      { name: 'tokenKey', type: 'string' },
      { name: 'beneficiaryData', type: 'bytes32' },
      { name: 'minOutput', type: 'bytes32' },
      { name: 'sourceChainId', type: 'uint32' },
      { name: 'sourceTokenKey', type: 'string' },
    ],
    name: 'WithdrawPublicValues',
    type: 'tuple',
  },
];

function parsePublicValues(hexData) {
  // Remove 0x prefix if present
  const data = hexData.startsWith('0x') ? hexData.slice(2) : hexData;
  
  console.log('=== Parsing WithdrawPublicValues using ethers.js ===\n');
  console.log(`Data length: ${data.length / 2} bytes (${data.length} hex chars)\n`);

  try {
    // Use ethers.js to decode the ABI-encoded struct
    const coder = new ethers.AbiCoder();
    
    // Decode the struct
    const decoded = coder.decode(
      ['tuple(bytes32,bytes32[],uint256,uint8,uint32,uint32,string,bytes32,bytes32,uint32,string)'],
      '0x' + data
    )[0];

    console.log('Parsed values:');
    // Remove duplicate 0x prefix if present
    const commitmentRoot = decoded[0].startsWith('0x') ? decoded[0] : '0x' + decoded[0];
    console.log(`  commitmentRoot: ${commitmentRoot}`);
    console.log(`  nullifiers: ${decoded[1].length} items`);
    decoded[1].forEach((n, i) => {
      const nullifier = n.startsWith('0x') ? n : '0x' + n;
      console.log(`    nullifier[${i}]: ${nullifier}`);
    });
    // ethers v6 returns BigInt for uint256
    const amount = typeof decoded[2] === 'bigint' ? decoded[2] : BigInt(decoded[2]);
    console.log(`  amount: ${amount.toString()} (0x${amount.toString(16)})`);
    console.log(`  intentType: ${decoded[3]}`);
    console.log(`  slip44chainID: ${decoded[4]}`);
    console.log(`  adapterId: ${decoded[5]}`);
    console.log(`  tokenKey: "${decoded[6]}"`);
    const beneficiaryData = decoded[7].startsWith('0x') ? decoded[7] : '0x' + decoded[7];
    const minOutput = decoded[8].startsWith('0x') ? decoded[8] : '0x' + decoded[8];
    console.log(`  beneficiaryData: ${beneficiaryData}`);
    console.log(`  minOutput: ${minOutput}`);
    console.log(`  sourceChainId: ${decoded[9]}`);
    console.log(`  sourceTokenKey: "${decoded[10]}"`);
    
    // Extract beneficiary address from beneficiaryData (last 20 bytes)
    const beneficiaryDataHex = beneficiaryData.startsWith('0x') ? beneficiaryData.slice(2) : beneficiaryData;
    const beneficiaryAddr = '0x' + beneficiaryDataHex.slice(24);
    console.log(`  → beneficiary address: ${beneficiaryAddr}`);
    
    return decoded;
  } catch (error) {
    console.error('Error parsing:', error.message);
    throw error;
  }
}

// Test with the provided hex data
const hexData = process.argv[2] || '00000000000000000000000000000000000000000000000000000000000000204cd98f67a065034a66a27ca0c066abf230a0339016398967717d3310c5a9c04400000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000001b33519d8fc40000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002ca000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000006f3995e2e40ca58adcbd47a2edad192e43d98638000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002ca0000000000000000000000000000000000000000000000000000000000000220000000000000000000000000000000000000000000000000000000000000000414c3bd295ae585080dd940991fa8d993afb388912fbafe64c1e425edff9a083a420010f4d94e19a806576adbdd0afe3052205fc62278be77ddabb6f451f3ccb9eebcce1a838eb84949a890d340dc5938982fd80816d47e0c252fd4910ee5b727aa614e95242b0537caa1336d2a0ba9701a5ca589fd9efc031c242d6330a0e85f000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000045553445400000000000000000000000000000000000000000000000000000000';

parsePublicValues(hexData);

