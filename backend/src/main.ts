import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: true, credentials: true });
  }
  await app.listen(parseInt(process.env.PORT ?? '3000', 10), '0.0.0.0');
}
bootstrap();
