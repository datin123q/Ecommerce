module.exports = {
  apps: [
    {
      name: 'commerce-api-1',
      script: './dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'commerce-api-2',
      script: './dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};