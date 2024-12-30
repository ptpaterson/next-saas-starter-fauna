import { Client } from 'fauna';

export const getServerClient = () => {
  return new Client({
    secret: process.env.FAUNA_SERVER_SECRET!,
  });
};
