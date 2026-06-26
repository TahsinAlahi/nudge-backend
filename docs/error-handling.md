# Error Handling

## The Problem

Without a global error handler, every controller would need try/catch blocks.
Unhandled exceptions would return ugly 500s with stack traces exposed to the
client. A global exception filter solves this.

---

## GlobalExceptionFilter (`src/common/filter/http-exception.filter.ts`)

```typescript
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

    this.logger.error(`Error: ${request?.url} - ${JSON.stringify(message)}`);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
```

### How It Works

1. **`@Catch()`** — catches **all** exceptions (empty parens = catch everything)
2. **Checks if it's an `HttpException`** — NestJS exceptions have a status code
   and response body
3. **Unknown exceptions** — treated as 500 Internal Server Error
4. **Logs the error** — with URL and message for debugging
5. **Returns structured JSON** — consistent format for every error response

---

## Exception Hierarchy in NestJS

```
Error
 └─ HttpException
      ├─ BadRequestException          (400)
      ├─ UnauthorizedException        (401)
      ├─ ForbiddenException           (403)
      ├─ NotFoundException            (404)
      ├─ ConflictException            (409)
      ├─ InternalServerErrorException (500)
      └─ ...many more
```

**Key point:** Throw any of these from your code and the filter handles it:

```typescript
throw new BadRequestException('Email already exists');
throw new NotFoundException('User not found');
throw new UnauthorizedException('Invalid credentials');
```

---

## Default Error Response Format

All errors follow this shape:

```json
{
  "statusCode": 404,
  "timestamp": "2026-06-27T12:00:00.000Z",
  "path": "/api/users/999",
  "message": "User not found"
}
```

---

## Key Points to Remember

- **`@Catch()` with no arguments** = catch everything (like a global try/catch)
- **Always return structured JSON** — never send raw stack traces to clients
- **Log the error** — the filter logs the URL + message; for debugging, add
  `exception.stack` to the log in development
- **The filter is registered globally** in `main.ts` via
  `app.useGlobalFilters(new GlobalExceptionFilter())`
- **This is a "catch-all"** — you can add more specific filters for particular
  exception types if needed

---

## References

- [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)
