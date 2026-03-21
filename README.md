# EcomRTX AI Backend

Production-ready NestJS Backend configured for AWS Lambda.

## Environment Variables
Create a `.env` file based on `.env.example`:
DATABASE_URL=
GEMINI_API_KEY=
JWT_SECRET=

## Local Usage
```bash
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```

## Deployment to AWS Lambda
Ensure you have the Serverless CLI installed (`npm i -g serverless`) and AWS credentials configured.
```bash
npm run build
npm run deploy
```
