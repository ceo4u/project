const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.extensionSession.findFirst().then(s => {
    console.log('Token:', s?.token);
    p.$disconnect();
});
