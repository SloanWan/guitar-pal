package com.guitarpal.api.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Every error answers as an RFC 9457 problem ({@code application/problem+json}).
 *
 * <p>The base class covers what Spring MVC raises itself — a bad parameter, a failed
 * {@code @Min}, an unknown path — with its own 4xx. Anything else is a bug: it is
 * logged in full and the reply says nothing about it.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	@ExceptionHandler(Exception.class)
	ProblemDetail unexpected(Exception e) {
		log.error("Unhandled error", e);
		return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong.");
	}
}
