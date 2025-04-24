export default async function handler(req, res) {
    if (req.method === 'POST') {
        console.log('Log received:', req.body);
        res.status(200).json({ status: 'Log received' });
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}