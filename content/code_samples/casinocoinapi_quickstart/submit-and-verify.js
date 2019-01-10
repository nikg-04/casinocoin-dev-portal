'use strict';
/* import CasinocoinAPI and support libraries */
const CasinocoinAPI = require('casinocoin-libjs').CasinocoinAPI;
const assert = require('assert');

/* Credentials of the account placing the order */
const source_address = 'cBfj2uhFVoP2pPi1nbtQAvsKyzcH792LAd';
const destination_address = 'cpxrUWbYQZFUqUnk6NBkWaJTE3iGZWNk9b';

const secret = 's████████████████████████████';

/* Define the order to place here */
const payment = {
  source: {
    address: source_address,
    maxAmount: {
      value: '10.0',
      currency: 'CSC'
    }
  },
  destination: {
    address: destination_address,
    amount: {
      value: '10.0',
      currency: 'CSC'
    }
  }
};

/* Milliseconds to wait between checks for a new ledger. */
const INTERVAL = 1000;
/* Instantiate CasinocoinAPI. */
const api = new CasinocoinAPI({ server: 'wss://ws01.casinocoin.org:4443' });
/* Number of ledgers to check for valid transaction before failing */
const ledgerOffset = 5;
const instructions = { maxLedgerVersionOffset: ledgerOffset };


/* Verify a transaction is in a validated CSC Ledger version */
function verifyTransaction(hash, options) {
  console.log('Verifing Transaction');
  return api.getTransaction(hash, options).then(data => {
    console.log('Final Result: ', data.outcome.result);
    console.log('Validated in Ledger: ', data.outcome.ledgerVersion);
    console.log('Sequence: ', data.sequence);
    return data.outcome.result === 'tesSUCCESS';
  }).catch(error => {
    /* If transaction not in latest validated ledger,
       try again until max ledger hit */
    if (error instanceof api.errors.PendingLedgerVersionError) {
      return new Promise((resolve, reject) => {
        setTimeout(() => verifyTransaction(hash, options)
		.then(resolve, reject), INTERVAL);
      });
    }
    return error;
  });
}

/* Function to prepare, sign, and submit a transaction to the CSC Ledger. */
function submitTransaction(lastClosedLedgerVersion, prepared, secret) {
  const signedData = api.sign(prepared.txJSON, secret);
  return api.submit(signedData.signedTransaction).then(data => {
    console.log('Tentative Result: ', data.resultCode);
    console.log('Tentative Message: ', data.resultMessage);
    /* If transaction was not successfully submitted throw error */
    assert.strictEqual(data.resultCode, 'tesSUCCESS');
    /* 'tesSUCCESS' means the transaction is being considered for the next ledger, and requires validation. */

    /* If successfully submitted, begin validation workflow */
    const options = {
      minLedgerVersion: lastClosedLedgerVersion,
      maxLedgerVersion: prepared.instructions.maxLedgerVersion
    };
    return new Promise((resolve, reject) => {
      setTimeout(() => verifyTransaction(signedData.id, options)
	.then(resolve, reject), INTERVAL);
    });
  });
}

api.connect().then(() => {
  console.log('Connected');
  return api.preparePayment(source_address, payment, instructions);
}).then(prepared => {
  console.log('Payment Prepared');
  return api.getLedger().then(ledger => {
    console.log('Current Ledger', ledger.ledgerVersion);
    return submitTransaction(ledger.ledgerVersion, prepared, secret);
  });
}).then(() => {
  api.disconnect().then(() => {
    console.log('api disconnected');
    process.exit();
  });
}).catch(console.error);
