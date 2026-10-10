import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // Strip unknown fields and reject requests with properties the DTO doesn't declare.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:5173').split(',');
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Serve uploaded company logos directly; see CompaniesController#uploadLogo.
  // Resolved from the working directory (same base as multer's './uploads/logos'), not __dirname:
  // the compiled output lives in dist/src, so a __dirname-relative path points to the wrong folder.
  // The CORP header lets the SPA (different origin/port) embed the images.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  });

  // API-first: Swagger/OpenAPI docs are the contract the React frontend (and any future client)
  // is built against.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Meisterwerk API')
    .setDescription('Cloud-Plattform für Handwerksbetriebe – REST-API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Meisterwerk API läuft auf http://localhost:${port} (Docs: /api/docs)`);
}

bootstrap();
