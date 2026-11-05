const express = require('express');
const app = express();
app.get('/api/health', (req, res) => res.json({ status: 'API ERP RP Operante' }));
app.listen(3001, () => console.log('Servidor rodando porta 3001'));