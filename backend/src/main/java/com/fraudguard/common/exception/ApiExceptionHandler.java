package com.fraudguard.common.exception;

import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ProblemDetail> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(
                ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Authentication failed"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalidRequest() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Check required fields and permitted lengths");
    }

    @ExceptionHandler(ConcurrencyFailureException.class)
    ProblemDetail concurrentChange() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Concurrent change; retry the request");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail conflictingData() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Data conflicts with an existing record");
    }
}
