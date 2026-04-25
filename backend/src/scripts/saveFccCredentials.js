#!/usr/bin/env node

const path = require('path');
const readline = require('readline');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabase = require('../lib/supabase');
const { encryptFedexSecret } = require('../services/fedexCredentials');

const DEFAULT_ACCOUNT_ID = '2f1f7045-93ec-42d4-aa61-272077496482';
const DEFAULT_FEDEX_ACCOUNT_ID = 'f616f2e7-6095-4581-9446-7c8a8df24058';

function ask(question, { secret = false } = {}) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  return new Promise((resolve) => {
    if (secret) {
      rl.stdoutMuted = true;
      const originalWrite = rl._writeToOutput;
      rl._writeToOutput = function writeMasked(value) {
        if (rl.stdoutMuted && value !== '\n' && value !== '\r\n') {
          rl.output.write('*');
          return;
        }

        originalWrite.call(rl, value);
      };
    }

    rl.question(question, (answer) => {
      rl.close();

      if (secret) {
        process.stdout.write('\n');
      }

      resolve(answer);
    });
  });
}

function mask(value) {
  const normalized = String(value || '');

  if (normalized.length <= 4) {
    return '****';
  }

  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
}

async function main() {
  const accountId = process.env.READYROUTE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID;
  const fedexAccountId = process.env.READYROUTE_FEDEX_ACCOUNT_ID || DEFAULT_FEDEX_ACCOUNT_ID;
  const username = String(await ask('FCC/MyBizAccount username: ')).trim();
  const password = String(await ask('FCC/MyBizAccount password: ', { secret: true }));

  if (!username || !password) {
    throw new Error('Username and password are required. Nothing was saved.');
  }

  const timestamp = new Date().toISOString();
  const accountNumber = `FCC${username.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`.slice(0, 32);
  const { data, error } = await supabase
    .from('fedex_accounts')
    .update({
      nickname: 'FCC Portal Access',
      account_number: accountNumber,
      billing_contact_name: 'FCC Portal',
      billing_company_name: 'ReadyRoute FCC Access',
      billing_address_line1: 'FCC Portal Credential',
      billing_address_line2: null,
      billing_city: 'FCC Portal',
      billing_state_or_province: 'NA',
      billing_postal_code: '00000',
      billing_country_code: 'US',
      connection_status: 'connected',
      connection_reference: null,
      fcc_username: username,
      fcc_password_encrypted: encryptFedexSecret(password),
      fcc_password_updated_at: timestamp,
      last_verified_at: timestamp,
      disconnected_at: null,
      updated_at: timestamp
    })
    .eq('account_id', accountId)
    .eq('id', fedexAccountId)
    .select('id, account_number, fcc_username, fcc_password_updated_at')
    .single();

  if (error) {
    throw error;
  }

  console.log(`Saved FCC credentials for ${mask(data.fcc_username)} on ${data.account_number}.`);
  console.log(`Password encrypted at ${data.fcc_password_updated_at}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
