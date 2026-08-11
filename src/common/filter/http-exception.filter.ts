/* eslint-disable 
@typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, 
@typescript-eslint/no-unsafe-call  */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal Server Error';

    if (exception instanceof HttpException) {
      this.logger.error({
        name: exception.name,
        message: `Error: ${request?.url} - ${JSON.stringify(message)}`,
        stack: exception.stack,
      });
    } else {
      console.error(exception);
      this.logger.error(`Error: ${request?.url} - ${JSON.stringify(message)}`);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
