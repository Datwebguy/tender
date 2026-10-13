import postgres from 'postgres';

let sqlClient;

function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  if (!sqlClient) {
    sqlClient = postgres(process.env.DATABASE_URL, {
      ssl: 'require',
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sqlClient;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'catalog_storage_not_configured' });
  try {
    const sql = db();
    const rows = await sql`SELECT id, name, description, amount, token, image_url FROM tender_products WHERE active = TRUE ORDER BY created_at ASC`;
    return res.status(200).json({ products: rows.map((row) => ({ id: row.id, name: row.name, description: row.description, amount: row.amount, token: row.token, imageUrl: row.image_url })) });
  } catch (error) {
    console.error('Tender product API request failed.');
    return res.status(500).json({ error: 'catalog_storage_error' });
  }
}
