import mysql from 'mysql2/promise';

const credentials = [
  { user: 'root', password: '' },
  { user: 'root', password: 'root' },
  { user: 'root', password: 'password' },
  { user: 'uniflow_ops_app', password: '' },
  { user: 'uniflow_ops_app', password: 'uniflow_ops_app' },
  { user: 'uniflow', password: 'uniflow' },
  { user: 'uniflow_ops', password: 'uniflow_ops' }
];

async function main() {
  for (const cred of credentials) {
    try {
      const conn = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3306,
        user: cred.user,
        password: cred.password
      });
      console.log(`SUCCESS: user='${cred.user}', password='${cred.password}'`);
      await conn.end();
      return;
    } catch (err: any) {
      console.log(`Failed for user='${cred.user}', password='${cred.password}': ${err.message}`);
    }
  }
}

main();
