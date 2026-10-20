package com.fraudguard.common;

import org.springframework.http.HttpStatus;

/** Base class for all business exceptions; mapped to an HTTP response by {@link GlobalExceptionHandler}. */
public class FraudGuardException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public FraudGuardException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
