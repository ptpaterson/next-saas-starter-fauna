import 'dotenv/config';
import { Client, fql } from 'fauna';

import { stripe } from '../payments/stripe';

const client = new Client({
  secret: process.env.FAUNA_ADMIN_SECRET!,
});

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  const baseProduct = await stripe.products.create({
    name: 'Base',
    description: 'Base subscription plan',
  });

  await stripe.prices.create({
    product: baseProduct.id,
    unit_amount: 800, // $8 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  const plusProduct = await stripe.products.create({
    name: 'Plus',
    description: 'Plus subscription plan',
  });

  await stripe.prices.create({
    product: plusProduct.id,
    unit_amount: 1200, // $12 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  console.log('Stripe products and prices created successfully.');
}

async function seed() {
  const email = 'test@test.com';
  const password = 'admin123';

  // bootstrap a new user and team in the Fauna database with a single transaction
  await client.query(fql`
    // Create a user
    let user = User.create({
      email: ${email},
      role: "owner",
    })
    
    // Create credentials for the user.
    // The password will be automatically hashed by Fauna
    Credential.create({
      document: user,
      password: ${password},
    })

    // Create a team
    let team = Team.create({
      name: "Test Team",
    })

    // Connect the user and team together
    TeamMember.create({
      team: team,
      user: user,
      role: "owner",
    })
  `);

  await createStripeProducts();
}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
