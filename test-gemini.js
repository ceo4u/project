require('dotenv').config();
const fetch = require('node-fetch');

async function test() {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const prompt = "hello";
    const parts = [{ text: prompt }];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

test();
