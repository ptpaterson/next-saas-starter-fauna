import YAML from 'yaml';
import { exec, execSync } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

function question(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    }),
  );
}

async function checkEnvironment() {
  await checkFaunaCLI();
  await checkStripeCLI();
}

async function checkFaunaCLI() {
  console.log('Checking if Fauna CLI is installed and authenticated...');
  try {
    execSync('fauna --version');
    console.log('Fauna CLI is installed.');

    // Check if Fauna CLI is authenticated
    try {
      execSync('fauna database list');
      console.log('Fauna CLI is authenticated.');
    } catch (_error) {
      console.log(
        'Fauna CLI is not authenticated or the authentication has expired.',
      );
      console.log('Please run: fauna login');
      const answer = await question(
        'Have you completed the authentication? (y/n): ',
      );
      if (answer.toLowerCase() !== 'y') {
        console.log(
          'Please authenticate with Fauna CLI and run this script again.',
        );
        process.exit(1);
      }

      // Verify authentication after user confirms login
      try {
        execSync('fauna database list');
        console.log('Fauna CLI authentication confirmed.');
      } catch (_error) {
        console.error(
          'Failed to verify Fauna CLI authentication. Please try again.',
        );
        process.exit(1);
      }
    }
  } catch (_error) {
    console.error(
      'Fauna CLI is not installed. Please install it and try again.',
    );
    console.log('To install Fauna CLI, follow these steps:');
    console.log('1. Visit: https://docs.fauna.com/fauna/current/build/cli/v4/');
    console.log(
      '2. Download and install the Fauna CLI for your operating system',
    );
    console.log('3. After installation, run: fauna login');
    console.log(
      'After installation and authentication, please run this setup script again.',
    );
    process.exit(1);
  }
}

async function checkStripeCLI() {
  console.log('Checking if Stripe CLI is installed and authenticated...');
  try {
    execSync('stripe --version');
    console.log('Stripe CLI is installed.');

    // Check if Stripe CLI is authenticated
    try {
      execSync('stripe config --list');
      console.log('Stripe CLI is authenticated.');
    } catch (_error) {
      console.log(
        'Stripe CLI is not authenticated or the authentication has expired.',
      );
      console.log('Please run: stripe login');
      const answer = await question(
        'Have you completed the authentication? (y/n): ',
      );
      if (answer.toLowerCase() !== 'y') {
        console.log(
          'Please authenticate with Stripe CLI and run this script again.',
        );
        process.exit(1);
      }

      // Verify authentication after user confirms login
      try {
        execSync('stripe config --list');
        console.log('Stripe CLI authentication confirmed.');
      } catch (_error) {
        console.error(
          'Failed to verify Stripe CLI authentication. Please try again.',
        );
        process.exit(1);
      }
    }
  } catch (_error) {
    console.error(
      'Stripe CLI is not installed. Please install it and try again.',
    );
    console.log('To install Stripe CLI, follow these steps:');
    console.log('1. Visit: https://docs.stripe.com/stripe-cli');
    console.log(
      '2. Download and install the Stripe CLI for your operating system',
    );
    console.log('3. After installation, run: stripe login');
    console.log(
      'After installation and authentication, please run this setup script again.',
    );
    process.exit(1);
  }
}

async function setupFauna(): Promise<{
  databaseName: string;
  FAUNA_ENDPOINT: string;
  FAUNA_ADMIN_SECRET: string;
  FAUNA_SERVER_SECRET: string;
}> {
  let databaseName;
  let FAUNA_ENDPOINT;
  let FAUNA_ADMIN_SECRET;
  let FAUNA_SERVER_SECRET;

  const fslDirectory = path.join(__dirname, './schema');

  // Do everything locally
  const localChoice = await question(
    'Do you want to use a local Fauna instance with Docker? (y/N): ',
  );
  if (localChoice.toLowerCase() === 'y') {
    console.log('Setting up local Fauna instance with Docker...');
    await setupLocalFauna();

    FAUNA_ENDPOINT = 'http://localhost:8443';
    FAUNA_ADMIN_SECRET = 'secret';

    console.log('Generating a new keys...');

    const serverKeyCommand = `fauna query --local --json 'Key.create({role: "server"}).secret'`;
    console.log(`\n> ${serverKeyCommand}\n`);
    const { stdout: server_out } = await execAsync(serverKeyCommand);
    FAUNA_SERVER_SECRET = JSON.parse(server_out) as string;

    databaseName = 'local';

    try {
      console.log('Updating Fauna database schema...');
      const fslCommand = `fauna schema push --local --fsl-directory ${fslDirectory} --active  --no-input`;
      console.log(`\n> ${fslCommand}\n`);
      await execAsync(fslCommand);
    } catch (error: any) {
      console.error('Failed to update Fauna database schema:');
      console.error(error.stderr);
      process.exit(1);
    }
  } else {
    console.log('Setting up Fauna instance in the cloud...');

    const dbChoice = await question(
      'What is the database path? (e.g. us/next_saas_starter);',
    );

    try {
      console.log('Generating a new keys...');

      const adminKeyCommand = `fauna query --database ${dbChoice} --json 'Key.create({role: "admin"}).secret'`;
      const serverKeyCommand = `fauna query --database ${dbChoice} --json 'Key.create({role: "server"}).secret'`;

      console.log(`\n> ${adminKeyCommand}\n`);
      const { stdout: admin_out } = await execAsync(adminKeyCommand);
      FAUNA_ADMIN_SECRET = JSON.parse(admin_out) as string;

      console.log(`\n> ${serverKeyCommand}\n`);
      const { stdout: server_out } = await execAsync(serverKeyCommand);
      FAUNA_SERVER_SECRET = JSON.parse(server_out) as string;
    } catch (error: any) {
      console.error(`Failed to create keys for db '${dbChoice}':`);
      console.error(error.stderr);
      process.exit(1);
    }

    FAUNA_ENDPOINT = 'https://db.fauna.com';

    databaseName = dbChoice;

    try {
      console.log('Updating Fauna database schema...');
      console.log(
        `\n> fauna schema push --endpoint $FAUNA_ENDPOINT --secret $FAUNA_ADMIN_SECRET --fsl-directory ${fslDirectory} --active  --no-input\n`,
      );
      await execAsync(
        `fauna schema push --endpoint ${FAUNA_ENDPOINT} --secret ${FAUNA_ADMIN_SECRET} --fsl-directory ${fslDirectory} --active  --no-input`,
      );
    } catch (error: any) {
      console.error('Failed to update Fauna database schema:');
      console.error(error.stderr);
      process.exit(1);
    }
  }

  return {
    databaseName,
    FAUNA_ENDPOINT,
    FAUNA_ADMIN_SECRET,
    FAUNA_SERVER_SECRET,
  };
}

async function setupLocalFauna() {
  console.log('Checking if Docker is installed...');
  try {
    execSync('docker --version');
    console.log('Docker is installed.');
  } catch (_error) {
    console.error(
      'Docker is not installed. Please install Docker and try again.',
    );
    console.log(
      'To install Docker, visit: https://docs.docker.com/get-docker/',
    );
    process.exit(1);
  }

  try {
    console.log('\n> fauna local\n');
    execSync('fauna local');
    console.log('Docker container started successfully.');
  } catch (_error) {
    console.error(
      'Failed to start Docker container. Please check your Docker installation and try again.',
    );
    process.exit(1);
  }
}

async function getStripeSecretKey(): Promise<string> {
  console.log(
    'You can find your Stripe Secret Key at: https://dashboard.stripe.com/test/apikeys',
  );
  return await question('Enter your Stripe Secret Key: ');
}

async function createStripeWebhook(): Promise<string> {
  try {
    const { stdout } = await execAsync('stripe listen --print-secret');
    const match = stdout.match(/whsec_[a-zA-Z0-9]+/);
    if (!match) {
      throw new Error('Failed to extract Stripe webhook secret');
    }
    console.log('Stripe webhook created.');
    return match[0];
  } catch (error) {
    console.error(
      'Failed to create Stripe webhook. Check your Stripe CLI installation and permissions.',
    );
    if (os.platform() === 'win32') {
      console.log(
        'Note: On Windows, you may need to run this script as an administrator.',
      );
    }
    throw error;
  }
}

function generateAuthSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function writeEnvFile(envVars: Record<string, string>) {
  const envContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(path.join(process.cwd(), '.env'), envContent);
  console.log('.env file created with the necessary variables.');
}

type ProfileName = string;
type FaunaConfig = Record<
  ProfileName,
  {
    database?: string;
    local?: boolean;
    'fsl-directory': string;
  }
>;

function writeFaunaConfigFile(config: FaunaConfig) {
  const filePath = path.join(process.cwd(), '.fauna.config.yaml');

  let existingConfig = {};
  try {
    const existingContent = fs.readFileSync(filePath).toString();
    existingConfig = YAML.parse(existingContent);
  } catch (_) {
    // do nothing
  }

  const configContent = YAML.stringify({ ...existingConfig, ...config });

  fs.writeFileSync(filePath, configContent);
  console.log('.fauna.config.yaml file created with the necessary options.');
}

async function main() {
  console.log('Step 1: Checking for the development environment...');
  await checkEnvironment();

  console.log('Step 2: Setting up Fauna...');
  const {
    databaseName,
    FAUNA_ENDPOINT,
    FAUNA_ADMIN_SECRET,
    FAUNA_SERVER_SECRET,
  } = await setupFauna();

  console.log('Step 3: Getting Stripe Secret Key...');
  const STRIPE_SECRET_KEY = await getStripeSecretKey();

  console.log('Step 4: Creating Stripe webhook...');
  const STRIPE_WEBHOOK_SECRET = await createStripeWebhook();

  console.log('Step 5: Generating AUTH_SECRET...');
  const AUTH_SECRET = generateAuthSecret();

  console.log('Step 6: Writing environment variables to .env...');
  const BASE_URL = 'http://localhost:3000';
  writeEnvFile({
    FAUNA_ENDPOINT,
    FAUNA_ADMIN_SECRET,
    FAUNA_SERVER_SECRET,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    BASE_URL,
    AUTH_SECRET,
  });

  console.log('Step 7: Writing Fauna config to fauna.config.yml...');

  const config: FaunaConfig =
    FAUNA_ENDPOINT == 'http://localhost:8443'
      ? { local: { local: true, 'fsl-directory': '.' } }
      : { prod: { database: databaseName, 'fsl-directory': '.' } };

  writeFaunaConfigFile(config);

  console.log('🎉 Setup completed successfully!');
}

main().catch(console.error);
