require('dotenv').config();

const { createApp } = require('./app');

const app = createApp();
const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'ReadyRoute API listening',
    port: PORT,
    release_commit: process.env.SOURCE_COMMIT || process.env.GIT_COMMIT_SHA || null
  }));
});
