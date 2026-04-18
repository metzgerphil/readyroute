require('dotenv').config();

const { createApp } = require('./app');

const app = createApp();
const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
