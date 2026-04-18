require('dotenv').config();

const readline = require('readline');
const bcrypt = require('bcrypt');
const supabase = require('../lib/supabase');

function prompt() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (question) => new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));

  return { rl, ask };
}

async function main() {
  const { rl, ask } = prompt();

  try {
    const accountLookup = await ask('Existing account manager email or company name: ');
    const email = (await ask('New manager email: ')).toLowerCase();
    const fullName = await ask('Manager full name (optional): ');
    const password = await ask('Manager password: ');

    if (!accountLookup || !email || !password) {
      throw new Error('Account lookup, manager email, and password are required.');
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error('Enter a valid manager email.');
    }

    if (password.length < 10) {
      throw new Error('Manager password must be at least 10 characters.');
    }

    const normalizedLookup = accountLookup.toLowerCase();
    let accountResult = await supabase
      .from('accounts')
      .select('id, company_name, manager_email')
      .eq('manager_email', normalizedLookup)
      .maybeSingle();

    if (accountResult.error) {
      throw new Error(`Failed to look up account: ${accountResult.error.message}`);
    }

    if (!accountResult.data) {
      accountResult = await supabase
        .from('accounts')
        .select('id, company_name, manager_email')
        .ilike('company_name', accountLookup)
        .maybeSingle();
    }

    if (accountResult.error) {
      throw new Error(`Failed to look up account: ${accountResult.error.message}`);
    }

    if (!accountResult.data) {
      throw new Error('No matching account found.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const existingManagerResult = await supabase
      .from('manager_users')
      .select('id, account_id, email')
      .eq('email', email)
      .maybeSingle();

    if (existingManagerResult.error && !['PGRST116', 'PGRST205', '42P01'].includes(existingManagerResult.error.code)) {
      throw new Error(`Failed to look up manager user: ${existingManagerResult.error.message}`);
    }

    let data;

    if (existingManagerResult.data) {
      const updateResult = await supabase
        .from('manager_users')
        .update({
          account_id: accountResult.data.id,
          full_name: fullName || null,
          password_hash: passwordHash,
          is_active: true
        })
        .eq('id', existingManagerResult.data.id)
        .select('id, account_id, email, full_name, is_active')
        .single();

      if (updateResult.error) {
        throw new Error(`Failed to update manager user: ${updateResult.error.message}`);
      }

      data = updateResult.data;
    } else {
      const insertResult = await supabase
        .from('manager_users')
        .insert({
          account_id: accountResult.data.id,
          email,
          full_name: fullName || null,
          password_hash: passwordHash,
          is_active: true
        })
        .select('id, account_id, email, full_name, is_active')
        .single();

      if (insertResult.error) {
        throw new Error(`Failed to save manager user: ${insertResult.error.message}`);
      }

      data = insertResult.data;
    }

    console.log('Manager user saved successfully.');
    console.log(JSON.stringify({
      manager_user: data,
      account: {
        id: accountResult.data.id,
        company_name: accountResult.data.company_name
      }
    }, null, 2));
  } catch (error) {
    console.error(error.message || 'Failed to save manager user');
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
