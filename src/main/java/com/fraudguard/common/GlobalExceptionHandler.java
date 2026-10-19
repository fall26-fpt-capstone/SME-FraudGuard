package com.fraudguard.common;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;

/** Maps business and validation errors to a uniform JSON body; other Spring MVC errors keep their defaults. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    public record ErrorResponse(String code, String message, List<String> details) {
    }

    @ExceptionHandler(FraudGuardException.class)
    ResponseEntity<ErrorResponse> handleBusiness(FraudGuardException ex) {
        return ResponseEntity.status(ex.getStatus()).body(new ErrorResponse(ex.getCode(), ex.getMessage(), List.of()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .toList();
        return ResponseEntity.badRequest().body(new ErrorResponse("VALIDATION_FAILED", "Request validation failed", details));
    }
}
