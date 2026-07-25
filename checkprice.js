// Calls jasprarbiter::checkprice once, signed by the restricted "keeper"
// permission (see setup steps -- this permission can ONLY call checkprice
// on this one contract, nothing else, so a leaked key here cannot move funds).
//
// Required environment variable:
//   KEEPER_PRIVATE_KEY   the private key for the "keeper" permission
//
// Optional:
//   WAX_RPC_ENDPOINT     defaults to a public node if not set
//   CONTRACT_ACCOUNT     defaults to "jasprarbiter"

const { Api, JsonRpc } = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');
const { TextEncoder, TextDecoder } = require('text-encoding');

const RPC_ENDPOINTS = [
  process.env.WAX_RPC_ENDPOINT,
  'https://wax.greymass.com',
  'https://wax.eosphere.io',
].filter(Boolean);

const CONTRACT = process.env.CONTRACT_ACCOUNT || 'testacct1434';

async function main() {
  const privateKey = process.env.KEEPER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('KEEPER_PRIVATE_KEY environment variable is not set');
  }

  const signatureProvider = new JsSignatureProvider([privateKey]);

  let lastError;
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const rpc = new JsonRpc(endpoint, { fetch });
      const api = new Api({
        rpc,
        signatureProvider,
        textDecoder: new TextDecoder(),
        textEncoder: new TextEncoder(),
      });

      const result = await api.transact(
        {
          actions: [
            {
              account: CONTRACT,
              name: 'checkprice',
              authorization: [{ actor: CONTRACT, permission: 'keeper' }],
              data: {},
            },
          ],
        },
        { blocksBehind: 3, expireSeconds: 30 }
      );

      console.log(`checkprice succeeded via ${endpoint}: ${result.transaction_id}`);
      return;
    } catch (err) {
      // A "nothing exceeded threshold" / "rate limited" revert is expected
      // most of the time -- that's not a failure, it just means there was
      // nothing to do. Only genuinely unexpected errors should fail the job.
      const msg = String(err && err.message || err);
      if (msg.includes('nothing exceeded threshold') || msg.includes('rate limited')) {
        console.log(`No rebalance needed right now (${endpoint}): ${msg}`);
        return;
      }
      console.warn(`Attempt via ${endpoint} failed: ${msg}`);
      lastError = err;
    }
  }

  throw lastError || new Error('All RPC endpoints failed');
}

main().catch((err) => {
  console.error('Keeper run failed:', err);
  process.exit(1);
});
