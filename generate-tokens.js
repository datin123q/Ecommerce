const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken'); // Chắc chắn bạn đã cài jsonwebtoken
const fs = require('fs');

const prisma = new PrismaClient();

// Thay bằng chuỗi bí mật thật của bạn trong file .env
JWT_ACCESS_SECRET='super_secret_access_key_123456';

async function main() {
  const users = await prisma.user.findMany({
    take: 2000,
    select: { id: true, email: true, role: true }
  });

  if (users.length === 0) {
    console.log('Không có user nào trong database!');
    return;
  }

  let csvContent = '';

  for (const user of users) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    
    const token = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '7d' });
    csvContent += `${token}\n`;
  }

  fs.writeFileSync('tokens.csv', csvContent);
  console.log(`Đã xuất thành công ${users.length} tokens ra file tokens.csv`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });