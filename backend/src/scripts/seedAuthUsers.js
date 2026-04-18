require('dotenv').config();

const readline = require('readline');
const bcrypt = require('bcrypt');
const supabase = require('../lib/supabase');

function createPrompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  function ask(question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  }

  return { rl, ask };
}

async function promptForRequired(ask, question, validate, errorMessage) {
  while (true) {
    const answer = await ask(question);

    if (validate(answer)) {
      return answer;
    }

    console.log(errorMessage);
  }
}

async function upsertAccount({ companyName, managerEmail, managerPasswordHash }) {
  const existingAccountQuery = await supabase
    .from('accounts')
    .select('id, company_name')
    .eq('manager_email', managerEmail)
    .maybeSingle();

  if (existingAccountQuery.error) {
    throw new Error(`Failed to look up account: ${existingAccountQuery.error.message}`);
  }

  if (existingAccountQuery.data) {
    const updateResult = await supabase
      .from('accounts')
      .update({
        company_name: companyName,
        manager_email: managerEmail,
        manager_password_hash: managerPasswordHash
      })
      .eq('id', existingAccountQuery.data.id)
      .select('id, company_name, manager_email')
      .single();

    if (updateResult.error) {
      throw new Error(`Failed to update account: ${updateResult.error.message}`);
    }

    return { account: updateResult.data, created: false };
  }

  const insertResult = await supabase
    .from('accounts')
    .insert({
      company_name: companyName,
      manager_email: managerEmail,
      manager_password_hash: managerPasswordHash
    })
    .select('id, company_name, manager_email')
    .single();

  if (insertResult.error) {
    throw new Error(`Failed to create account: ${insertResult.error.message}`);
  }

  return { account: insertResult.data, created: true };
}

async function upsertManagerUser({ accountId, managerEmail, managerPasswordHash }) {
  const existingManagerQuery = await supabase
    .from('manager_users')
    .select('id, account_id, email')
    .eq('email', managerEmail)
    .maybeSingle();

  if (existingManagerQuery.error && existingManagerQuery.error.code !== 'PGRST116') {
    throw new Error(`Failed to look up manager user: ${existingManagerQuery.error.message}`);
  }

  if (existingManagerQuery.data) {
    const updateResult = await supabase
      .from('manager_users')
      .update({
        account_id: accountId,
        password_hash: managerPasswordHash,
        is_active: true
      })
      .eq('id', existingManagerQuery.data.id)
      .select('id, account_id, email')
      .single();

    if (updateResult.error) {
      throw new Error(`Failed to update manager user: ${updateResult.error.message}`);
    }

    return { managerUser: updateResult.data, created: false };
  }

  const insertResult = await supabase
    .from('manager_users')
    .insert({
      account_id: accountId,
      email: managerEmail,
      password_hash: managerPasswordHash,
      is_active: true
    })
    .select('id, account_id, email')
    .single();

  if (insertResult.error) {
    throw new Error(`Failed to create manager user: ${insertResult.error.message}`);
  }

  return { managerUser: insertResult.data, created: true };
}

async function upsertDriver({ accountId, driverName, driverEmail, driverPinHash }) {
  const existingDriverQuery = await supabase
    .from('drivers')
    .select('id, name, email, account_id')
    .eq('email', driverEmail)
    .maybeSingle();

  if (existingDriverQuery.error) {
    throw new Error(`Failed to look up driver: ${existingDriverQuery.error.message}`);
  }

  if (existingDriverQuery.data) {
    const updateResult = await supabase
      .from('drivers')
      .update({
        account_id: accountId,
        name: driverName,
        email: driverEmail,
        pin: driverPinHash,
        is_active: true
      })
      .eq('id', existingDriverQuery.data.id)
      .select('id, name, email, account_id')
      .single();

    if (updateResult.error) {
      throw new Error(`Failed to update driver: ${updateResult.error.message}`);
    }

    return { driver: updateResult.data, created: false };
  }

  const insertResult = await supabase
    .from('drivers')
    .insert({
      account_id: accountId,
      name: driverName,
      email: driverEmail,
      pin: driverPinHash,
      is_active: true,
      hourly_rate: 0
    })
    .select('id, name, email, account_id')
    .single();

  if (insertResult.error) {
    throw new Error(`Failed to create driver: ${insertResult.error.message}`);
  }

  return { driver: insertResult.data, created: true };
}

async function main() {
  const { rl, ask } = createPrompt();

  try {
    const companyName = await promptForRequired(
      ask,
      'Company name: ',
      (value) => value.length > 0,
      'Company name is required.'
    );

    const managerEmail = (
      await promptForRequired(
        ask,
        'Manager email: ',
        (value) => /^\S+@\S+\.\S+$/.test(value),
        'Enter a valid manager email.'
      )
    ).toLowerCase();

    const managerPassword = await promptForRequired(
      ask,
      'Manager password: ',
      (value) => value.length >= 10,
      'Manager password must be at least 10 characters.'
    );

    const driverName = await promptForRequired(
      ask,
      'Driver name: ',
      (value) => value.length > 0,
      'Driver name is required.'
    );

    const driverEmail = (
      await promptForRequired(
        ask,
        'Driver email: ',
        (value) => /^\S+@\S+\.\S+$/.test(value),
        'Enter a valid driver email.'
      )
    ).toLowerCase();

    const driverPin = await promptForRequired(
      ask,
      'Driver 4-digit PIN: ',
      (value) => /^\d{4}$/.test(value),
      'Driver PIN must be exactly 4 digits.'
    );

    rl.close();

    const managerPasswordHash = await bcrypt.hash(managerPassword, 10);
    const driverPinHash = await bcrypt.hash(driverPin, 10);

    const { account, created: accountCreated } = await upsertAccount({
      companyName,
      managerEmail,
      managerPasswordHash
    });

    const { managerUser, created: managerUserCreated } = await upsertManagerUser({
      accountId: account.id,
      managerEmail,
      managerPasswordHash
    });

    const { driver, created: driverCreated } = await upsertDriver({
      accountId: account.id,
      driverName,
      driverEmail,
      driverPinHash
    });

    console.log('Seed completed successfully.');
    console.log(JSON.stringify({
      account: {
        id: account.id,
        company_name: account.company_name,
        manager_email: managerEmail,
        action: accountCreated ? 'created' : 'updated'
      },
      manager_user: {
        id: managerUser.id,
        email: managerUser.email,
        account_id: managerUser.account_id,
        action: managerUserCreated ? 'created' : 'updated'
      },
      driver: {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        account_id: driver.account_id,
        action: driverCreated ? 'created' : 'updated'
      }
    }, null, 2));
  } catch (error) {
    rl.close();
    console.error(error.message || 'Failed to seed auth users');
    process.exit(1);
  }
}

main();
