const { ethers } = require('ethers');

// ZKPay contract ABI (only the functions we need)
const ZKPayABI = [
  {
    inputs: [{ internalType: 'bytes32', name: 'root', type: 'bytes32' }],
    name: 'isKnownRoot',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'currentQueueRoot',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
];

async function checkCommitmentRoot(contractAddress, commitmentRoot, rpcUrl) {
  console.log('=== Checking Commitment Root on BSC ===\n');
  console.log(`Contract: ${contractAddress}`);
  console.log(`Commitment Root: ${commitmentRoot}\n`);

  try {
    // Connect to BSC network
    const provider = new ethers.JsonRpcProvider(rpcUrl || 'https://bsc-dataseed1.binance.org/');
    const contract = new ethers.Contract(contractAddress, ZKPayABI, provider);

    // Check if root is in recent roots
    const isKnown = await contract.isKnownRoot(commitmentRoot);
    console.log(`✅ isKnownRoot(${commitmentRoot}): ${isKnown}`);

    // Get current queue root
    const currentRoot = await contract.currentQueueRoot();
    console.log(`📋 currentQueueRoot: ${currentRoot}`);
    console.log(`   Match: ${currentRoot.toLowerCase() === commitmentRoot.toLowerCase() ? '✅ YES' : '❌ NO'}\n`);

    if (isKnown) {
      console.log('⚠️  This commitment root is in the recent roots list.');
      console.log('   It may have been used in a withdraw transaction.');
      console.log('   Check BSCScan for WithdrawRequested events with this root.');
    } else {
      console.log('✅ This commitment root is NOT in recent roots.');
      console.log('   It should be safe to use for a new withdraw transaction.');
    }

    return { isKnown, currentRoot };
  } catch (error) {
    console.error('❌ Error checking commitment root:', error.message);
    throw error;
  }
}

// Main execution
const contractAddress = process.argv[2] || '0xF5Dc3356F755E027550d82F665664b06977fa6d0';
const commitmentRoot = process.argv[3] || '0x0a49ad4d7adc0663d0ea65c7fd8e183a3588393bc09a7a26fd42edd6c2b9bc1d';
const rpcUrl = process.argv[4]; // Optional RPC URL

checkCommitmentRoot(contractAddress, commitmentRoot, rpcUrl)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

