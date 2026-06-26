require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

app.use('/agencies', require('./routes/agencies'));
app.use('/auth',     require('./routes/auth'));
app.use('/workers',  require('./routes/workers'));
app.use('/shifts',   require('./routes/shifts'));
app.use('/schedule', require('./routes/schedule'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
