module.exports = {
  apps: [0, 1, 2, 3, 4, 5].map((num) => ({
    name: `commerce-api-${num}`,
    script: './dist/src/main.js',
    node_args: num === 0 ? '--inspect=127.0.0.1:9230' : undefined,
    instances: 1, 
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000 + num, 
    },
  })),
};